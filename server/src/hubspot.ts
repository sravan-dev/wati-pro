import { logError, logInfo } from './logger.js';

const BASE = 'https://api.hubapi.com';
const MAX_RETRIES = 3;

export interface HubSpotProperty {
  name: string;
  label: string;
  type: string;
}

export class HubSpotError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'HubSpotError';
  }
}

export class HubSpotService {
  constructor(private accessToken: string) {}

  /** Swap the token at runtime (used when credentials are saved from the dashboard). */
  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  get configured(): boolean {
    return this.accessToken.trim() !== '';
  }

  private async request<T>(method: string, path: string, requestId: string, body?: unknown): Promise<T> {
    if (!this.configured) throw new HubSpotError('HUBSPOT_ACCESS_TOKEN is not set in .env', 0);

    let attempt = 0;
    for (;;) {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          'content-type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (res.status === 429 && attempt < MAX_RETRIES) {
        const delay = 500 * 2 ** attempt;
        attempt += 1;
        logInfo(requestId, `HubSpot 429 — retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      const text = await res.text();
      if (!res.ok) {
        let message = `HubSpot ${method} ${path} failed with ${res.status}`;
        try {
          const parsed = JSON.parse(text) as { message?: string };
          if (parsed.message) message = `${message}: ${parsed.message}`;
        } catch {
          // non-JSON error body — keep the generic message
        }
        throw new HubSpotError(message, res.status);
      }
      return (text === '' ? undefined : JSON.parse(text)) as T;
    }
  }

  /** True if the configured token can read contacts. */
  async checkToken(requestId: string): Promise<boolean> {
    if (!this.configured) return false;
    try {
      await this.request('GET', '/crm/v3/objects/contacts?limit=1', requestId);
      return true;
    } catch (err) {
      logError(requestId, 'HubSpot token check failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Find a contact by phone, tolerant of stored formats (`+91 79078 93367`,
   * `917907893367`, …) by token-searching on the last 10 digits.
   */
  async searchContactByPhone(phone: string, requestId: string): Promise<string | null> {
    const token = phone.replace(/\D/g, '').slice(-10);
    if (token.length < 7) return null;
    const matches = await this.searchContactsByPhones([token], requestId);
    return matches[0]?.id ?? null;
  }

  /**
   * Batch lookup by phone digits (e.g. the last 10 digits). Uses a wildcard token
   * search so stored formats like `+91 79078 93367` and `917907893367` all match.
   * HubSpot allows max 5 filterGroups per search, so tokens are chunked.
   */
  async searchContactsByPhones(
    phoneTokens: string[],
    requestId: string,
  ): Promise<Array<{ id: string; phone: string | null; watiSourceUrl: string | null }>> {
    const found: Array<{ id: string; phone: string | null; watiSourceUrl: string | null }> = [];
    for (let i = 0; i < phoneTokens.length; i += 5) {
      const chunk = phoneTokens.slice(i, i + 5);
      const result = await this.request<{
        results: Array<{ id: string; properties?: { phone?: string; wati_source_url?: string } }>;
      }>('POST', '/crm/v3/objects/contacts/search', requestId, {
        filterGroups: chunk.map((token) => ({
          filters: [{ propertyName: 'phone', operator: 'CONTAINS_TOKEN', value: `*${token}` }],
        })),
        properties: ['phone', 'wati_source_url'],
        limit: 100,
      });
      found.push(
        ...result.results.map((r) => ({
          id: r.id,
          phone: r.properties?.phone ?? null,
          watiSourceUrl: r.properties?.wati_source_url ?? null,
        })),
      );
    }
    return found;
  }

  async updateContact(id: string, properties: Record<string, string>, requestId: string): Promise<void> {
    await this.request('PATCH', `/crm/v3/objects/contacts/${id}`, requestId, { properties });
  }

  async createContact(properties: Record<string, string>, requestId: string): Promise<string> {
    const created = await this.request<{ id: string }>('POST', '/crm/v3/objects/contacts', requestId, {
      properties,
    });
    return created.id;
  }

  async listProperties(requestId: string): Promise<HubSpotProperty[]> {
    const result = await this.request<{ results: Array<{ name: string; label: string; type: string }> }>(
      'GET',
      '/crm/v3/properties/contacts',
      requestId,
    );
    return result.results.map(({ name, label, type }) => ({ name, label, type }));
  }

  /** Create a custom contact property. Idempotent: "already exists" (409) counts as success. */
  async createProperty(
    input: { name: string; label?: string; type?: string; fieldType?: string; groupName?: string },
    requestId: string,
  ): Promise<{ created: boolean }> {
    try {
      await this.request('POST', '/crm/v3/properties/contacts', requestId, {
        name: input.name,
        label: input.label ?? input.name,
        type: input.type ?? 'string',
        fieldType: input.fieldType ?? 'text',
        groupName: input.groupName ?? 'contactinformation',
      });
      return { created: true };
    } catch (err) {
      if (err instanceof HubSpotError && err.status === 409) return { created: false };
      throw err;
    }
  }
}
