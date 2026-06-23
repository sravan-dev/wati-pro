import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { serverRoot } from './env.js';

/**
 * Runtime-editable credentials, saved to a JSON file so they survive restarts
 * and can be changed from the dashboard's Settings panel (no .env edit needed).
 * When present, these override values from .env / env.local.js.
 */
export const settingsSchema = z.object({
  hubspotAccessToken: z.string().default(''),
  watiWebhookSecret: z.string().default(''),
  watiApiEndpoint: z.string().default(''),
  watiApiToken: z.string().default(''),
});
export type Settings = z.infer<typeof settingsSchema>;

export const EMPTY_SETTINGS: Settings = {
  hubspotAccessToken: '',
  watiWebhookSecret: '',
  watiApiEndpoint: '',
  watiApiToken: '',
};

/** Partial update from the UI — only non-empty fields are applied (blank = keep current). */
export const settingsUpdateSchema = z.object({
  hubspotAccessToken: z.string().optional(),
  watiWebhookSecret: z.string().optional(),
  watiApiEndpoint: z.string().optional(),
  watiApiToken: z.string().optional(),
});
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

export class JsonFileSettingsStore {
  constructor(private readonly filePath: string) {}

  /** Returns saved settings, or null if none have been saved yet. */
  load(): Settings | null {
    if (!fs.existsSync(this.filePath)) return null;
    return settingsSchema.parse(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
  }

  save(settings: Settings): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  }
}

export const defaultSettingsPath = path.resolve(serverRoot, 'data/settings.json');
