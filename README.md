# Wati → HubSpot Attribute Sync

Syncs Wati contact attributes into HubSpot whenever a lead hits Wati. Wati fires a
webhook on new/updated contacts; this app receives it, maps a configurable set of
attributes to HubSpot contact properties, and **upserts** the contact (match by
WhatsApp phone number → update if found, create if not).

- **`/server`** — Node + Express + TypeScript: webhook receiver, HubSpot REST client,
  zod validation, in-memory sync log (last 200).
- **`/client`** — Vite + React + Tailwind dashboard: connection status, editable
  attribute mapping, create-missing-HubSpot-properties UI, test sync, live sync log.

## Quick start

```bash
npm install
cp .env.example .env   # then fill in the values (see below)
npm run dev            # starts server on :3001 and dashboard on :5173
```

Open http://localhost:5173, check the connection status card, then click
**Send sample lead** to verify the end-to-end webhook → upsert path.

Run the phone-normalization unit tests with `npm test`.

## 1. Create the HubSpot private app + token

1. In HubSpot: **Settings → Integrations → Private Apps → Create a private app**.
2. Name it (e.g. "Wati Sync") and grant these scopes:
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.schemas.contacts.read`
   - `crm.schemas.contacts.write` ← required so the app can create custom properties
3. Create the app and copy the **access token** into `HUBSPOT_ACCESS_TOKEN` in `.env`.

## 2. Create the `wati_source_url` custom property

The default mapping targets one custom contact property: `wati_source_url`.

Easiest way: start the app, open the dashboard — any mapped property that doesn't
exist in HubSpot shows up in the **Missing in HubSpot** panel. Click **Create all**
(or **Create** per property). They are created as single-line text in the
*Contact information* group. The check also runs on server startup and after every
mapping save.

(Manual alternative: HubSpot → Settings → Properties → Contact properties → Create.)

## 3. Point the Wati webhook at the app

1. Pick a shared secret and put it in `WATI_WEBHOOK_SECRET` in `.env`.
2. In Wati: **Webhooks** → add a webhook for contact created/updated events pointing to:

   ```
   https://<your-host>/webhook/wati?secret=<your-secret>
   ```

   (Or send the secret as an `x-webhook-secret` header if your Wati plan supports
   custom headers.) Requests with a wrong/missing secret are rejected with 401.

3. **Local development:** Wati can't reach `localhost`, so use a tunnel, e.g.:

   ```bash
   ngrok http 3001
   ```

   and use the ngrok URL in the Wati webhook config.

## How the sync works

1. `POST /webhook/wati` verifies the shared secret, validates the JSON body with zod.
2. The WhatsApp number is extracted from the **dynamic** Wati key
   (`whatsapp_<countrycode>...` — any key starting with `whatsapp_` matches) and
   normalized to E.164 (`+919567509910`). No valid number → the lead is rejected
   and logged.
3. The mapping (below) turns Wati attributes into HubSpot contact properties.
4. **Upsert:** search HubSpot contacts by `phone`; update on match, create otherwise.
   Re-sending the same lead updates — it never duplicates.
5. HubSpot `429` responses are retried with exponential backoff (max 3 retries).
   The webhook always answers 200/4xx with a JSON body — never an unhandled error.
6. Every attempt is recorded to the in-memory sync log (visible in the dashboard,
   capped at 200 entries). The log and mapping stores are behind small interfaces
   (`SyncLogStore`, `MappingStore`) so they can be swapped for SQLite later.

## Attribute mapping

The mapping is editable from the dashboard and persisted to
`server/data/mapping.json` (seeded on first run with the defaults below).

**By default this app pushes only `source_url`.** Wati's native HubSpot integration
already syncs the other contact attributes (channel, source, campaign, lead status,
lifecycle stage, …) but not `source_url` — this app fills exactly that gap, so the
two never fight over the same fields.

| Wati attribute   | HubSpot property        | Transform        |
|------------------|-------------------------|------------------|
| `whatsapp_*`     | `phone`                 | `normalizePhone` — E.164 (match key only) |
| `source_url`     | `wati_source_url`       | none             |

A trailing `*` in a Wati attribute is a prefix wildcard (used for the dynamic
`whatsapp_<countrycode>...` key). The `phone` row is the upsert **match key** — it is
written only when the app has to create a brand-new contact, never on update. Webhook
events that carry no `source_url` are **skipped** (logged, but HubSpot is not touched).
If you ever want to sync more attributes, just add rows back in the dashboard's
mapping editor.

## API

| Method | Path                  | Purpose |
|--------|-----------------------|---------|
| POST   | `/webhook/wati`       | Sync receiver (secret-protected) |
| GET    | `/health`             | `{ hubspot, webhookSecretSet }` |
| GET    | `/config/mapping`     | Current mapping |
| PUT    | `/config/mapping`     | Validate + persist mapping |
| GET    | `/hubspot/properties` | Live HubSpot contact properties |
| POST   | `/hubspot/properties` | Create a custom contact property (idempotent) |
| GET    | `/logs`               | Last 200 sync log entries, newest first |
| POST   | `/test/sample`        | Run the built-in sample payload through the sync |

## Environment

See `.env.example`. The `.env` file can live at the repo root or in `/server`.

```
HUBSPOT_ACCESS_TOKEN=  # HubSpot private app token
WATI_WEBHOOK_SECRET=   # shared secret for the Wati webhook
PORT=3001
```
