import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** Absolute path to the /server directory (resolves from both src/ via tsx and dist/). */
export const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(serverRoot, '..');

/**
 * Load a .env file, filling in any variable that is currently missing OR blank.
 * Plain dotenv refuses to touch a variable that already exists — but hosting
 * panels (e.g. Hostinger) inject *empty* strings for keys you declared but left
 * blank, and those empties would otherwise shadow the real values in .env.
 */
function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const parsed = dotenv.parse(fs.readFileSync(filePath));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

// The .env file can live at the repo root or in /server.
loadEnvFile(path.join(repoRoot, '.env'));
loadEnvFile(path.join(serverRoot, '.env'));

export const env = {
  hubspotAccessToken: process.env.HUBSPOT_ACCESS_TOKEN ?? '',
  watiWebhookSecret: process.env.WATI_WEBHOOK_SECRET ?? '',
  watiApiEndpoint: (process.env.WATI_API_ENDPOINT ?? '').replace(/\/+$/, ''),
  watiApiToken: process.env.WATI_API_TOKEN ?? '',
  port: Number(process.env.PORT ?? 3001),
};
