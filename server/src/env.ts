import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** Absolute path to the /server directory (resolves from both src/ via tsx and dist/). */
export const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(serverRoot, '..');

// The .env file can live at the repo root or in /server.
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(serverRoot, '.env') });

export const env = {
  hubspotAccessToken: process.env.HUBSPOT_ACCESS_TOKEN ?? '',
  watiWebhookSecret: process.env.WATI_WEBHOOK_SECRET ?? '',
  watiApiEndpoint: (process.env.WATI_API_ENDPOINT ?? '').replace(/\/+$/, ''),
  watiApiToken: process.env.WATI_API_TOKEN ?? '',
  port: Number(process.env.PORT ?? 3001),
};
