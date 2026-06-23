import { env } from './env.js';
import { logError } from './logger.js';

export interface WatiContact {
  name: string;
  phone: string;
  watiSource: string | null;
  channel: string | null;
  sourceUrl: string | null;
  campaign: string | null;
  created: string | null;
}

interface RawWatiContact {
  fullName?: string | null;
  firstName?: string | null;
  phone?: string | null;
  source?: string | null;
  created?: string | null;
  customParams?: Array<{ name?: string; value?: string }> | null;
}

export const watiConfigured = (): boolean =>
  env.watiApiEndpoint !== '' && env.watiApiToken.trim() !== '';

function toContact(raw: RawWatiContact): WatiContact {
  const params = new Map<string, string>();
  for (const p of raw.customParams ?? []) {
    if (p?.name && typeof p.value === 'string') params.set(p.name, p.value);
  }
  return {
    name: raw.fullName || raw.firstName || '(no name)',
    phone: raw.phone ?? '',
    watiSource: raw.source ?? null,
    channel: params.get('channel') ?? null,
    sourceUrl: params.get('source_url') ?? null,
    campaign: params.get('campaign_name') ?? null,
    created: raw.created ?? null,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(page: number, pageSize: number, name?: string): Promise<WatiContact[]> {
  const params = new URLSearchParams({ pageSize: String(pageSize), pageNumber: String(page) });
  if (name) params.set('name', name); // Wati does a substring match on the contact name
  const url = `${env.watiApiEndpoint}/api/v1/getContacts?${params.toString()}`;
  const maxRetries = 3;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${env.watiApiToken}` },
    });
    if (res.status === 429 && attempt < maxRetries) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) {
      // Surface Wati's own message — its 4xx body says *why* (bad token, IP
      // restriction, expired plan…), which is far more useful than the status.
      const detail = (await res.text()).slice(0, 300).replace(/\s+/g, ' ').trim();
      throw new Error(`Wati getContacts failed with ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    const body = (await res.json()) as { contact_list?: RawWatiContact[] };
    return (body.contact_list ?? []).map(toContact);
  }
}

// Wati rate-limits aggressively; cache responses briefly so dashboard refreshes
// (and React dev-mode double mounts) don't trigger a fresh 10-page scan each time.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: { contacts: WatiContact[]; scannedPages: number } }>();
const pending = new Map<string, Promise<{ contacts: WatiContact[]; scannedPages: number }>>();

export type WatiContactFilter = 'all' | 'ctwa' | 'sourceUrl';

const FILTER_PREDICATES: Record<Exclude<WatiContactFilter, 'all'>, (c: WatiContact) => boolean> = {
  // Inbound chat leads: CTWA (clicked a FB/IG ad) or direct WhatsApp messages.
  // Everything else in Wati is a HubSpot import with no chat behind it.
  ctwa: (c) => ['CTWA', 'WHATSAPP', 'WA'].includes((c.watiSource ?? '').toUpperCase()),
  sourceUrl: (c) => c.sourceUrl !== null && c.sourceUrl !== '',
};

/**
 * List Wati contacts. With a filter, scans up to `maxScanPages` pages of the most
 * recent contacts and returns just the matches (most Wati contacts are HubSpot
 * imports, so matches are sparse).
 */
export async function listWatiContacts(
  page: number,
  pageSize: number,
  filter: WatiContactFilter,
  requestId: string,
  limit?: number,
  name?: string,
): Promise<{ contacts: WatiContact[]; scannedPages: number }> {
  if (!watiConfigured()) {
    throw new Error('WATI_API_ENDPOINT / WATI_API_TOKEN are not set in .env');
  }

  const cacheKey = `${filter}:${page}:${pageSize}:${limit ?? 'all'}:${name ?? ''}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  // Coalesce concurrent identical requests into one Wati scan.
  const inFlight = pending.get(cacheKey);
  if (inFlight) return inFlight;

  const work = (async () => {
    if (filter === 'all') {
      return { contacts: await fetchPage(page, pageSize, name), scannedPages: 1 };
    }
    const predicate = FILTER_PREDICATES[filter];
    const maxScanPages = 10;
    const matches: WatiContact[] = [];
    let scanned = 0;
    for (let p = 1; p <= maxScanPages; p++) {
      if (p > 1) await sleep(300); // pace the scan to stay under Wati's rate limit
      const batch = await fetchPage(p, 100, name);
      scanned = p;
      matches.push(...batch.filter(predicate));
      // Contacts come newest-first, so once we have `limit` matches we can stop early.
      if (limit !== undefined && matches.length >= limit) break;
      if (batch.length < 100) break; // last page reached
    }
    return { contacts: limit === undefined ? matches : matches.slice(0, limit), scannedPages: scanned };
  })();

  pending.set(cacheKey, work);
  try {
    const value = await work;
    cache.set(cacheKey, { at: Date.now(), value });
    return value;
  } catch (err) {
    logError(requestId, 'Wati contact fetch failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    pending.delete(cacheKey);
  }
}
