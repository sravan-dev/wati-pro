/** The last 10 digits of any phone-ish string — the shared match key across the app. */
export const lastTenDigits = (value: string): string => value.replace(/\D/g, '').slice(-10);

/** Normalize a phone-ish string to E.164 (`+<7-15 digits>`). Returns null if implausible. */
export function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[^\d+]/g, '');
  let digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  // International dialing prefix (e.g. Wati's "00966...") — strip to the country code.
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!/^\d{7,15}$/.test(digits)) return null;
  return `+${digits}`;
}

/** Split a full name on the first space; lastname is optional. */
export function splitName(full: string): { firstname: string; lastname: string | null } {
  const trimmed = full.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) return { firstname: trimmed, lastname: null };
  return {
    firstname: trimmed.slice(0, spaceIndex),
    lastname: trimmed.slice(spaceIndex + 1).trim() || null,
  };
}

/**
 * Wati's WhatsApp field key is dynamic (`whatsapp_<countrycode><number>`). Match any
 * key starting with `whatsapp_`; the number may sit in the value or in the key itself.
 */
export function extractWhatsappNumber(payload: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(payload)) {
    if (!key.toLowerCase().startsWith('whatsapp_')) continue;
    if (typeof value === 'string' || typeof value === 'number') {
      const fromValue = normalizePhone(String(value));
      if (fromValue) return fromValue;
    }
    const fromKey = normalizePhone(key.slice('whatsapp_'.length));
    if (fromKey) return fromKey;
  }
  return null;
}
