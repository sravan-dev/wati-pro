import fs from 'node:fs';
import path from 'node:path';
import { serverRoot } from './env.js';

/**
 * A contact this app has already pushed to HubSpot, keyed by the last 10 phone digits.
 * HubSpot's search index is eventually consistent, so a freshly-created contact isn't
 * searchable for a while — without this ledger a repeat sync would create a duplicate.
 * Looking up the known contactId here lets repeat syncs update the same contact instead.
 */
export interface SyncedContact {
  hubspotContactId: string;
  phone: string;
  hasSourceUrl: boolean;
  lastSyncedAt: string; // ISO timestamp
}

/** Seam for a future SQLite-backed store: implement this and swap it in index.ts. */
export interface SyncedContactStore {
  get(phoneKey: string): SyncedContact | undefined;
  set(phoneKey: string, value: SyncedContact): void;
  delete(phoneKey: string): void;
}

export const defaultSyncedContactsPath = path.resolve(serverRoot, 'data/synced-contacts.json');

/** In-memory map of phoneKey → contact, persisted to JSON so it survives restarts. */
export class JsonFileSyncedContactStore implements SyncedContactStore {
  private map = new Map<string, SyncedContact>();

  constructor(private readonly filePath: string) {
    try {
      if (fs.existsSync(this.filePath)) {
        const obj = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Record<string, SyncedContact>;
        for (const [key, value] of Object.entries(obj)) this.map.set(key, value);
      }
    } catch {
      // Corrupt or unreadable file — start empty rather than crash.
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(Object.fromEntries(this.map), null, 2) + '\n', 'utf8');
  }

  get(phoneKey: string): SyncedContact | undefined {
    return this.map.get(phoneKey);
  }

  set(phoneKey: string, value: SyncedContact): void {
    this.map.set(phoneKey, value);
    this.save();
  }

  delete(phoneKey: string): void {
    if (this.map.delete(phoneKey)) this.save();
  }
}
