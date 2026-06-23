import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { serverRoot } from './env.js';
import { logInfo } from './logger.js';

export const transformSchema = z.enum(['none', 'splitName', 'normalizePhone']);
export type Transform = z.infer<typeof transformSchema>;

export const mappingRowSchema = z.object({
  watiAttribute: z.string().min(1),
  hubspotProperty: z.string().min(1),
  hubspotType: z.string().min(1).default('string'),
  transform: transformSchema.default('none'),
});
export type MappingRow = z.infer<typeof mappingRowSchema>;

export const mappingSchema = z.object({
  rows: z.array(mappingRowSchema),
});
export type Mapping = z.infer<typeof mappingSchema>;

/**
 * Seed mapping. `whatsapp_*` is a prefix wildcard — Wati's WhatsApp field name is
 * dynamic (`whatsapp_<countrycode>...`), so any key starting with `whatsapp_` matches.
 *
 * Only `source_url` is pushed: Wati's native HubSpot integration already syncs the
 * other contact attributes, so this app fills in just the one field that integration
 * misses. The phone row is the upsert match key, not a synced field — it is only
 * written when this app has to create a contact that doesn't exist yet.
 */
export const DEFAULT_MAPPING: Mapping = {
  rows: [
    { watiAttribute: 'whatsapp_*', hubspotProperty: 'phone', hubspotType: 'string', transform: 'normalizePhone' },
    { watiAttribute: 'source_url', hubspotProperty: 'wati_source_url', hubspotType: 'string', transform: 'none' },
  ],
};

/** Seam for a future SQLite-backed store: implement this interface and swap it in index.ts. */
export interface MappingStore {
  load(): Mapping;
  save(mapping: Mapping): void;
}

export class JsonFileMappingStore implements MappingStore {
  constructor(private readonly filePath: string) {}

  load(): Mapping {
    if (!fs.existsSync(this.filePath)) {
      this.save(DEFAULT_MAPPING);
      logInfo('startup', `Seeded default mapping at ${this.filePath}`);
      return DEFAULT_MAPPING;
    }
    const raw = fs.readFileSync(this.filePath, 'utf8');
    return mappingSchema.parse(JSON.parse(raw));
  }

  save(mapping: Mapping): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(mapping, null, 2) + '\n', 'utf8');
  }
}

export const defaultMappingPath = path.resolve(serverRoot, 'data/mapping.json');
