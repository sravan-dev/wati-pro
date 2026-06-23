import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { z } from 'zod';
import { env, repoRoot } from './env.js';
import { HubSpotService } from './hubspot.js';
import { logError, logInfo } from './logger.js';
import { InMemorySyncLogStore } from './logs.js';
import { defaultMappingPath, JsonFileMappingStore, mappingSchema } from './mapping.js';
import {
  defaultSettingsPath,
  EMPTY_SETTINGS,
  JsonFileSettingsStore,
  settingsUpdateSchema,
  type Settings,
} from './settings.js';
import { processLead, SAMPLE_WATI_PAYLOAD, watiPayloadSchema } from './sync.js';
import { listWatiContacts, watiConfigured, type WatiContactFilter } from './wati.js';

const app = express();
app.use(express.json({ limit: '256kb' }));

const hubspot = new HubSpotService(env.hubspotAccessToken);
const mappingStore = new JsonFileMappingStore(defaultMappingPath);
const settingsStore = new JsonFileSettingsStore(defaultSettingsPath);
const logs = new InMemorySyncLogStore();
let mapping = mappingStore.load();

const newRequestId = (): string => crypto.randomBytes(4).toString('hex');

/** Apply saved credentials to the live runtime — non-empty fields win over .env. */
function applySettings(settings: Settings): void {
  if (settings.hubspotAccessToken) {
    env.hubspotAccessToken = settings.hubspotAccessToken;
    hubspot.setAccessToken(settings.hubspotAccessToken);
  }
  if (settings.watiWebhookSecret) env.watiWebhookSecret = settings.watiWebhookSecret;
  if (settings.watiApiEndpoint) env.watiApiEndpoint = settings.watiApiEndpoint.replace(/\/+$/, '');
  if (settings.watiApiToken) env.watiApiToken = settings.watiApiToken;
}

// On boot, overlay any saved dashboard settings on top of the .env-derived config.
const savedSettings = settingsStore.load();
if (savedSettings) applySettings(savedSettings);

/** Mask a secret for display: keep only the last 4 chars plus its length (for spotting truncation). */
const secretStatus = (value: string): { set: boolean; hint: string; length: number } => ({
  set: value.trim() !== '',
  hint: value === '' ? '' : '••••' + value.slice(-4),
  length: value.length,
});

/** Log any mapped HubSpot properties that don't exist yet (the UI offers to create them). */
async function reportMissingProperties(requestId: string): Promise<void> {
  try {
    const existing = new Set((await hubspot.listProperties(requestId)).map((p) => p.name));
    const missing = mapping.rows.map((r) => r.hubspotProperty).filter((name) => !existing.has(name));
    if (missing.length > 0) {
      logInfo(requestId, 'Mapped HubSpot properties missing — create them from the dashboard', { missing });
    }
  } catch (err) {
    logError(requestId, 'Could not check HubSpot properties', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

app.post('/webhook/wati', async (req, res) => {
  const requestId = newRequestId();
  const querySecret = typeof req.query.secret === 'string' ? req.query.secret : undefined;
  const secret = querySecret ?? req.header('x-webhook-secret');
  if (!env.watiWebhookSecret || secret !== env.watiWebhookSecret) {
    logInfo(requestId, 'Rejected webhook: bad or missing secret');
    res.status(401).json({ ok: false, error: 'Invalid webhook secret' });
    return;
  }

  const parsed = watiPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'Invalid payload: expected a JSON object' });
    return;
  }

  const result = await processLead(parsed.data, requestId, hubspot, mapping, logs);
  res.status(200).json(result);
});

app.get('/health', async (_req, res) => {
  const ok = await hubspot.checkToken(newRequestId());
  res.json({
    hubspot: ok,
    webhookSecretSet: env.watiWebhookSecret.trim() !== '',
    watiApiConfigured: watiConfigured(),
    watiApiEndpointSet: env.watiApiEndpoint !== '',
  });
});

app.get('/config/mapping', (_req, res) => {
  res.json(mapping);
});

app.put('/config/mapping', async (req, res) => {
  const requestId = newRequestId();
  const parsed = mappingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message });
    return;
  }
  mapping = parsed.data;
  mappingStore.save(mapping);
  logInfo(requestId, 'Mapping saved', { rows: mapping.rows.length });
  await reportMissingProperties(requestId);
  res.json({ ok: true });
});

// Report current credentials without leaking secrets: secrets are masked to
// their last 4 chars; the (non-secret) Wati API endpoint is returned in full.
app.get('/config/settings', (_req, res) => {
  res.json({
    hubspotAccessToken: secretStatus(env.hubspotAccessToken),
    watiWebhookSecret: secretStatus(env.watiWebhookSecret),
    watiApiEndpoint: env.watiApiEndpoint,
    watiApiToken: secretStatus(env.watiApiToken),
  });
});

// Save credentials to settings.json and apply them live (no restart needed).
// Only non-empty fields are updated, so leaving a field blank keeps the current value.
app.put('/config/settings', (req, res) => {
  const requestId = newRequestId();
  const parsed = settingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message });
    return;
  }
  const current = settingsStore.load() ?? { ...EMPTY_SETTINGS };
  const update = parsed.data;
  const merged: Settings = {
    hubspotAccessToken: update.hubspotAccessToken?.trim() || current.hubspotAccessToken,
    watiWebhookSecret: update.watiWebhookSecret?.trim() || current.watiWebhookSecret,
    watiApiEndpoint:
      update.watiApiEndpoint !== undefined ? update.watiApiEndpoint.trim() : current.watiApiEndpoint,
    watiApiToken: update.watiApiToken?.trim() || current.watiApiToken,
  };
  settingsStore.save(merged);
  applySettings(merged);
  logInfo(requestId, 'Settings saved from dashboard');
  res.json({ ok: true });
});

app.get('/hubspot/properties', async (_req, res) => {
  try {
    res.json({ properties: await hubspot.listProperties(newRequestId()) });
  } catch (err) {
    res.status(502).json({ properties: [], error: err instanceof Error ? err.message : String(err) });
  }
});

const createPropertySchema = z.object({
  name: z.string().min(1),
  label: z.string().optional(),
  type: z.string().optional(),
  fieldType: z.string().optional(),
  groupName: z.string().optional(),
});

app.post('/hubspot/properties', async (req, res) => {
  const requestId = newRequestId();
  const parsed = createPropertySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message });
    return;
  }
  try {
    const { created } = await hubspot.createProperty(parsed.data, requestId);
    logInfo(requestId, created ? 'Created HubSpot property' : 'HubSpot property already exists', {
      name: parsed.data.name,
    });
    res.json({ ok: true, created });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(requestId, 'Property creation failed', { name: parsed.data.name, error: message });
    res.status(502).json({ ok: false, error: message });
  }
});

app.get('/wati/contacts', async (req, res) => {
  const requestId = newRequestId();
  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 50, 1), 100);
  const filter: WatiContactFilter =
    req.query.filter === 'inbox' || req.query.filter === 'ctwa' || req.query.filter === 'sourceUrl'
      ? req.query.filter
      : 'all';
  const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : undefined;
  const search =
    typeof req.query.search === 'string' && req.query.search.trim() !== '' ? req.query.search.trim() : undefined;
  try {
    const result = await listWatiContacts(page, pageSize, filter, requestId, limit, search);
    res.json(result);
  } catch (err) {
    res.status(502).json({
      contacts: [],
      scannedPages: 0,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

const syncStatusSchema = z.object({
  phones: z.array(z.string().min(5)).min(1).max(50),
});

const lastDigits = (value: string): string => value.replace(/\D/g, '').slice(-10);

// For each Wati phone, report whether a HubSpot contact exists and whether its
// wati_source_url is already filled — powers the table's Sync column.
app.post('/hubspot/sync-status', async (req, res) => {
  const requestId = newRequestId();
  const parsed = syncStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message });
    return;
  }
  const phones = parsed.data.phones;
  const tokens = [...new Set(phones.map((p) => lastDigits(p)).filter((t) => t.length >= 7))];
  try {
    const found = await hubspot.searchContactsByPhones(tokens, requestId);
    const statuses: Record<string, { status: 'synced' | 'no_url' | 'missing'; contactId: string | null }> = {};
    for (const phone of phones) {
      const match = found.find((f) => f.phone !== null && lastDigits(f.phone) === lastDigits(phone));
      if (!match) statuses[phone] = { status: 'missing', contactId: null };
      else if (match.watiSourceUrl) statuses[phone] = { status: 'synced', contactId: match.id };
      else statuses[phone] = { status: 'no_url', contactId: match.id };
    }
    res.json({ statuses });
  } catch (err) {
    res.status(502).json({ statuses: {}, error: err instanceof Error ? err.message : String(err) });
  }
});

const watiPushSchema = z.object({
  phone: z.string().min(7),
  sourceUrl: z.string().min(1),
  name: z.string().optional(),
});

// Push one Wati contact's source_url to HubSpot on demand (the table's Update button).
// Reuses the exact webhook pipeline, so the result lands in the sync log too.
app.post('/wati/push', async (req, res) => {
  const requestId = newRequestId();
  const parsed = watiPushSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message });
    return;
  }
  const { phone, sourceUrl, name } = parsed.data;
  const payload: Record<string, unknown> = {
    [`whatsapp_${phone.replace(/\D/g, '')}`]: phone,
    source_url: sourceUrl,
  };
  if (name) payload.name = name;
  const result = await processLead(payload, requestId, hubspot, mapping, logs);
  res.status(200).json(result);
});

app.get('/logs', (_req, res) => {
  res.json({ entries: logs.list() });
});

app.post('/test/sample', async (_req, res) => {
  const result = await processLead(SAMPLE_WATI_PAYLOAD, newRequestId(), hubspot, mapping, logs);
  res.json(result);
});

// In production, serve the built client (client/dist) from the same origin so the
// API and the dashboard share one Node process — that's all Hostinger runs.
const clientDist = path.join(repoRoot, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: any non-API GET serves index.html so client-side routing works.
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Always answer JSON, never an unhandled error page.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logError('error-handler', 'Unhandled request error', {
    error: err instanceof Error ? err.message : String(err),
  });
  res.status(400).json({ ok: false, error: 'Bad request' });
});

app.listen(env.port, () => {
  logInfo('startup', `Server listening on http://localhost:${env.port}`);
  if (!env.hubspotAccessToken) logInfo('startup', 'HUBSPOT_ACCESS_TOKEN is empty — set it in .env');
  if (!env.watiWebhookSecret) logInfo('startup', 'WATI_WEBHOOK_SECRET is empty — set it in .env');
  void reportMissingProperties('startup');
});
