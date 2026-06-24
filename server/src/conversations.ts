import fs from 'node:fs';
import path from 'node:path';
import { serverRoot } from './env.js';

/**
 * A WhatsApp conversation, built up from Wati message webhooks. Wati's API has no
 * "list conversations" endpoint, so we mirror the inbox ourselves: every incoming
 * message webhook updates the matching conversation here.
 */
export interface Conversation {
  phone: string;
  name: string;
  lastMessage: string;
  lastMessageAt: string; // ISO timestamp
  lastDirection: 'in' | 'out';
  unread: number;
  source: string | null;
}

export interface RecordedMessage {
  phone: string;
  name?: string;
  text: string;
  at: string; // ISO timestamp
  direction: 'in' | 'out';
  source?: string | null;
}

export const defaultConversationsPath = path.resolve(serverRoot, 'data/conversations.json');

/** In-memory conversation index, persisted to JSON so it survives restarts. */
export class ConversationStore {
  private map = new Map<string, Conversation>();

  constructor(private readonly filePath: string) {
    try {
      if (fs.existsSync(this.filePath)) {
        const arr = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Conversation[];
        for (const c of arr) this.map.set(c.phone, c);
      }
    } catch {
      // Corrupt or unreadable file — start empty rather than crash.
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify([...this.map.values()], null, 2) + '\n', 'utf8');
  }

  /** Apply one message: updates last message/time and the unread counter. */
  record(msg: RecordedMessage): Conversation {
    const existing = this.map.get(msg.phone);
    // Inbound bumps the unread count; an outbound (agent/bot reply) clears it.
    const unread = msg.direction === 'in' ? (existing?.unread ?? 0) + 1 : 0;
    const conversation: Conversation = {
      phone: msg.phone,
      name: msg.name || existing?.name || '(no name)',
      lastMessage: msg.text,
      lastMessageAt: msg.at,
      lastDirection: msg.direction,
      unread,
      source: msg.source ?? existing?.source ?? null,
    };
    this.map.set(msg.phone, conversation);
    this.save();
    return conversation;
  }

  markRead(phone: string): void {
    const c = this.map.get(phone);
    if (c && c.unread !== 0) {
      c.unread = 0;
      this.save();
    }
  }

  /** All conversations, newest activity first. */
  list(): Conversation[] {
    return [...this.map.values()].sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
  }
}
