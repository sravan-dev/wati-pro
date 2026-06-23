export interface Health {
  hubspot: boolean;
  webhookSecretSet: boolean;
  watiApiConfigured?: boolean;
  watiApiEndpointSet?: boolean;
}

export interface SecretStatus {
  set: boolean;
  hint: string;
}

export interface SettingsStatus {
  hubspotAccessToken: SecretStatus;
  watiWebhookSecret: SecretStatus;
  watiApiEndpoint: string;
  watiApiToken: SecretStatus;
}

export interface SettingsUpdate {
  hubspotAccessToken?: string;
  watiWebhookSecret?: string;
  watiApiEndpoint?: string;
  watiApiToken?: string;
}

export interface MappingRow {
  watiAttribute: string;
  hubspotProperty: string;
  hubspotType: string;
  transform: 'none' | 'splitName' | 'normalizePhone';
}

export interface Mapping {
  rows: MappingRow[];
}

export interface HubSpotProperty {
  name: string;
  label: string;
  type: string;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  requestId: string;
  phone: string | null;
  name: string | null;
  action: 'created' | 'updated' | 'skipped' | 'rejected' | 'error';
  status: 'success' | 'error';
  hubspotContactId: string | null;
  error: string | null;
}

export interface WatiContact {
  name: string;
  phone: string;
  watiSource: string | null;
  channel: string | null;
  sourceUrl: string | null;
  campaign: string | null;
  created: string | null;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  getHealth: () => http<Health>('/health'),
  getSettings: () => http<SettingsStatus>('/config/settings'),
  saveSettings: (input: SettingsUpdate) =>
    http<{ ok: boolean }>('/config/settings', { method: 'PUT', body: JSON.stringify(input) }),
  getMapping: () => http<Mapping>('/config/mapping'),
  saveMapping: (mapping: Mapping) =>
    http<{ ok: boolean }>('/config/mapping', { method: 'PUT', body: JSON.stringify(mapping) }),
  getProperties: () => http<{ properties: HubSpotProperty[] }>('/hubspot/properties'),
  createProperty: (input: { name: string; type?: string }) =>
    http<{ ok: boolean; created: boolean }>('/hubspot/properties', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getLogs: () => http<{ entries: SyncLogEntry[] }>('/logs'),
  getSyncStatus: (phones: string[]) =>
    http<{ statuses: Record<string, { status: 'synced' | 'no_url' | 'missing'; contactId: string | null }> }>(
      '/hubspot/sync-status',
      { method: 'POST', body: JSON.stringify({ phones }) },
    ),
  pushWatiContact: (input: { phone: string; sourceUrl: string; name?: string }) =>
    http<{ ok: boolean; action: string; hubspotContactId: string | null; error: string | null }>(
      '/wati/push',
      { method: 'POST', body: JSON.stringify(input) },
    ),
  getWatiContacts: (params: { page: number; filter: 'all' | 'ctwa' | 'sourceUrl'; limit?: number }) =>
    http<{ contacts: WatiContact[]; scannedPages: number }>(
      `/wati/contacts?page=${params.page}&pageSize=50&filter=${params.filter}` +
        (params.limit ? `&limit=${params.limit}` : ''),
    ),
  sendSample: () => http<Record<string, unknown>>('/test/sample', { method: 'POST' }),
};
