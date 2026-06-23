import { z } from 'zod';
import type { HubSpotService } from './hubspot.js';
import { logError, logInfo } from './logger.js';
import type { SyncLogStore } from './logs.js';
import type { Mapping } from './mapping.js';
import { extractWhatsappNumber, normalizePhone, splitName } from './phone.js';

/** The webhook boundary: any JSON object; values validated/coerced per mapping row. */
export const watiPayloadSchema = z.record(z.unknown());
export type WatiPayload = z.infer<typeof watiPayloadSchema>;

export interface SyncResult {
  ok: boolean;
  action: 'created' | 'updated' | 'skipped' | 'rejected' | 'error';
  phone: string | null;
  hubspotContactId: string | null;
  properties: Record<string, string>;
  error: string | null;
}

/** Resolve a mapping row's Wati attribute against the payload. `prefix*` is a wildcard. */
function resolveAttribute(payload: WatiPayload, attribute: string): string | undefined {
  const readValue = (key: string): string | undefined => {
    const value = payload[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return undefined;
  };

  const starIndex = attribute.indexOf('*');
  if (starIndex === -1) return readValue(attribute);

  const prefix = attribute.slice(0, starIndex);
  for (const key of Object.keys(payload)) {
    if (!key.toLowerCase().startsWith(prefix.toLowerCase())) continue;
    // Dynamic keys (e.g. whatsapp_919...) may carry the data in the key itself.
    return readValue(key) ?? key.slice(prefix.length);
  }
  return undefined;
}

/** Apply the mapping to a payload, producing HubSpot contact properties. */
export function applyMapping(payload: WatiPayload, mapping: Mapping): Record<string, string> {
  const properties: Record<string, string> = {};
  for (const row of mapping.rows) {
    const raw = resolveAttribute(payload, row.watiAttribute);
    if (raw === undefined) continue;

    switch (row.transform) {
      case 'splitName': {
        const { firstname, lastname } = splitName(raw);
        properties[row.hubspotProperty] = firstname;
        if (row.hubspotProperty === 'firstname' && lastname) properties.lastname = lastname;
        break;
      }
      case 'normalizePhone': {
        const normalized = normalizePhone(raw);
        if (normalized) properties[row.hubspotProperty] = normalized;
        break;
      }
      default:
        properties[row.hubspotProperty] = raw;
    }
  }
  return properties;
}

/**
 * The core sync: map the payload, then upsert into HubSpot keyed on the
 * normalized WhatsApp phone number. Shared by /webhook/wati and /test/sample.
 */
export async function processLead(
  payload: WatiPayload,
  requestId: string,
  hubspot: HubSpotService,
  mapping: Mapping,
  logs: SyncLogStore,
): Promise<SyncResult> {
  const phone = extractWhatsappNumber(payload);
  const properties = applyMapping(payload, mapping);
  const name = typeof payload.name === 'string' ? payload.name : null;

  const record = (
    action: SyncResult['action'],
    status: 'success' | 'error',
    hubspotContactId: string | null,
    error: string | null,
  ): SyncResult => {
    logs.add({
      requestId,
      phone,
      name,
      action,
      status,
      hubspotContactId,
      error,
      mappedProperties: properties,
    });
    return { ok: status === 'success', action, phone, hubspotContactId, properties, error };
  };

  if (!phone) {
    logInfo(requestId, 'Rejected payload: no valid whatsapp_* phone number found');
    return record('rejected', 'error', null, 'No valid whatsapp_* phone number in payload');
  }

  // Phone is only the match key; everything else is what we actually push. Wati's
  // native HubSpot sync owns the other attributes, so if this event carries none of
  // our mapped fields (e.g. no source_url), don't touch HubSpot at all.
  const { phone: _phoneKey, ...syncedProperties } = properties;
  if (Object.keys(syncedProperties).length === 0) {
    logInfo(requestId, 'Skipped: payload has none of the mapped attributes', { phone });
    return record('skipped', 'success', null, null);
  }

  try {
    const existingId = await hubspot.searchContactByPhone(phone, requestId);
    if (existingId) {
      // Update only the synced fields — leave phone (and anything the native
      // Wati↔HubSpot integration manages) untouched on existing contacts.
      await hubspot.updateContact(existingId, syncedProperties, requestId);
      logInfo(requestId, 'Updated HubSpot contact', { contactId: existingId, phone });
      return record('updated', 'success', existingId, null);
    }
    const newId = await hubspot.createContact(properties, requestId);
    logInfo(requestId, 'Created HubSpot contact', { contactId: newId, phone });
    return record('created', 'success', newId, null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(requestId, 'HubSpot upsert failed', { phone, error: message });
    return record('error', 'error', null, message);
  }
}

export const SAMPLE_WATI_PAYLOAD: WatiPayload = {
  name: 'Rajesh S',
  whatsapp_919567509910: '919567509910',
  channel: 'OFFLINE',
  source: 'IMPORT',
  campaign_name: '146335455',
  hs_lead_status: 'Not Qualified',
  lifecyclestage: 'lead',
  source_id: '120247266607610115',
  source_url: 'https://fb.me/3YABrkQKI',
};
