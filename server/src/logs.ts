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
  mappedProperties: Record<string, string> | null;
}

/** Seam for a future SQLite-backed store: implement this interface and swap it in index.ts. */
export interface SyncLogStore {
  add(entry: Omit<SyncLogEntry, 'id' | 'timestamp'>): SyncLogEntry;
  list(): SyncLogEntry[];
}

const MAX_ENTRIES = 200;

export class InMemorySyncLogStore implements SyncLogStore {
  private entries: SyncLogEntry[] = [];
  private nextId = 1;

  add(entry: Omit<SyncLogEntry, 'id' | 'timestamp'>): SyncLogEntry {
    const full: SyncLogEntry = {
      ...entry,
      id: String(this.nextId++),
      timestamp: new Date().toISOString(),
    };
    this.entries.unshift(full);
    if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES;
    return full;
  }

  list(): SyncLogEntry[] {
    return this.entries;
  }
}
