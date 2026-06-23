# Build Prompt — Wati → HubSpot Attribute Sync

> Paste this into your AI coding tool (Claude Code, Cursor, etc.). Adjust the
> **Attribute Mapping** table and env values to match your account before running.

---

## Goal

Build a small full-stack app that **syncs specific Wati contact attributes into HubSpot
whenever a new lead hits Wati**. Wati fires a webhook on new/updated contacts; the app
receives it, maps a defined set of attributes to HubSpot contact properties, and
**upserts** the contact in HubSpot (match by WhatsApp phone number → update if found,
create if not).

## Tech Stack

- **Frontend:** Vite + React + TypeScript + Tailwind CSS — a config/monitoring dashboard.
- **Backend:** Node.js + Express + TypeScript — webhook receiver + HubSpot client.
- **HubSpot client:** `@hubspot/api-client` (official).
- **Validation:** `zod` for parsing webhook payloads.
- Single repo, two workspaces (`/client`, `/server`). Use `concurrently` so
  `npm run dev` starts both. No database required for v1 — keep sync logs in memory
  (cap at last 200 entries); leave a clear seam to swap in SQLite later.

## Core Flow (backend)

1. `POST /webhook/wati` receives the Wati payload.
2. **Verify** the request: compare a shared secret from header/query against
   `WATI_WEBHOOK_SECRET`. Reject with 401 if it doesn't match.
3. Parse + validate the payload with zod. Extract the WhatsApp phone number as the
   **unique key** (normalize to E.164, e.g. `+919567509910`).
4. Map the configured Wati attributes → HubSpot properties (see table below).
5. **Upsert in HubSpot:** search contacts by phone; if a match exists, update its
   properties; otherwise create a new contact.
6. Record the result (success/fail, contact id, timestamp, mapped payload) to the
   in-memory log and return `200`.
7. Handle HubSpot `429` with exponential backoff + retry (max 3). Never throw an
   unhandled error back to Wati — always 200/4xx with a JSON body.

## Attribute Mapping (Wati → HubSpot)

| Wati attribute   | HubSpot property        | Notes                                   |
|------------------|-------------------------|-----------------------------------------|
| `name`           | `firstname` / `lastname`| Split on first space; lastname optional |
| `whatsapp_91...` | `phone`                 | Unique key; normalize to E.164          |
| `channel`        | `wati_channel`          | Custom property                         |
| `source`         | `wati_source`           | Custom property                         |
| `campaign_name`  | `wati_campaign_name`    | Custom property                         |
| `source_id`      | `wati_source_id`        | Custom property                         |
| `source_url`     | `wati_source_url`       | Custom property                         |
| `hs_lead_status` | `hs_lead_status`        | Standard HubSpot property               |
| `lifecyclestage` | `lifecyclestage`        | Standard HubSpot property               |

> The mapping is **user-editable from the dashboard** (see Mapping Editor below), not a
> static file. Persist it to `server/data/mapping.json` (seeded with the table above on
> first run) and load it at startup. Keep a typed `Mapping` model as the single source of
> truth. Custom properties (`wati_*`) must exist in HubSpot — on startup and after any
> mapping save, call the Properties API and flag any mapped custom properties that don't
> yet exist (the UI lets the user create them; see below).

## Auth & Env

Use a `.env` file (provide `.env.example`):

```
HUBSPOT_ACCESS_TOKEN=   # HubSpot private app token. Scopes: crm.objects.contacts.read,
                        # crm.objects.contacts.write, crm.schemas.contacts.read,
                        # crm.schemas.contacts.write (last one is required to create properties)
WATI_WEBHOOK_SECRET=    # shared secret you set on the Wati webhook
PORT=3001
```

HubSpot auth = private app access token via Bearer header (the official client handles this).

## Dashboard (frontend)

A clean single-page dashboard with:

1. **Connection status** — pings `GET /health` (checks HubSpot token validity) and shows
   green/red for HubSpot + whether the webhook secret is set.
2. **Mapping editor** — the core of the dashboard. An editable table of mapping rows,
   each row = `{ watiAttribute, hubspotProperty, hubspotType, transform }`:
   - **Add / edit / delete rows.** `watiAttribute` is free text (Wati attribute key),
     `hubspotProperty` is the internal HubSpot property name.
   - **HubSpot property picker:** a dropdown for `hubspotProperty` populated from the live
     list of contact properties (`GET /hubspot/properties`), so users map to real
     properties and can see which already exist. Allow typing a new name for ones that
     don't exist yet.
   - **`transform`** dropdown per row: `none`, `splitName` (name → firstname/lastname),
     `normalizePhone`.
   - **Save** button → `PUT /config/mapping` (validates + persists `mapping.json`).
   - Inline validation: warn on duplicate HubSpot targets and on unknown HubSpot
     properties (those not in the live list), with a one-click **"Create in HubSpot"**.
3. **Create custom properties in HubSpot** — for any mapped `hubspotProperty` that
   doesn't exist yet, show it in a "Missing in HubSpot" panel with a **Create** button
   (single) and **Create all** button. This calls `POST /hubspot/properties` which creates
   the property in HubSpot's `contactinformation` group with the chosen type (default
   `string` / single-line text). After creation, refresh the property list so the warning
   clears. This is the "set the custom mapping into HubSpot" step done from the UI.
4. **Test sync** — a "Send sample lead" button that POSTs a realistic sample Wati payload
   to the webhook and shows the response, so the user can verify end-to-end without Wati.
5. **Sync log** — a live-updating table (poll `GET /logs` every 5s): time, phone, name,
   action (created/updated), status, HubSpot contact id, error (if any).

Keep the UI minimal and functional — cards + a table, neutral palette, no decoration.

## Backend Endpoints

- `POST /webhook/wati` — the sync receiver (above).
- `GET /health` — `{ hubspot: boolean, webhookSecretSet: boolean }`.
- `GET /config/mapping` — returns the current mapping.
- `PUT /config/mapping` — validates (zod) and persists the mapping to `mapping.json`.
- `GET /hubspot/properties` — returns the live list of HubSpot contact properties
  (name, label, type) so the UI can populate the picker and detect missing ones.
- `POST /hubspot/properties` — creates a custom contact property in HubSpot
  `{ name, label, type, fieldType, groupName }` (default `string` / `text` /
  `contactinformation`). Idempotent: if it already exists, return success without error.
- `GET /logs` — returns the last 200 sync log entries (newest first).
- `POST /test/sample` — fires a built-in sample payload through the same handler.

## Sample Wati Webhook Payload (use for the test + zod schema)

```json
{
  "name": "Rajesh S",
  "whatsapp_919567509910": "919567509910",
  "channel": "OFFLINE",
  "source": "IMPORT",
  "campaign_name": "146335455",
  "hs_lead_status": "Not Qualified",
  "lifecyclestage": "lead",
  "source_id": "120247266607610115",
  "source_url": "https://fb.me/3YABrkQKI"
}
```

> Note: the WhatsApp field name in Wati is dynamic (`whatsapp_<countrycode>...`). Parse it
> by matching any key starting with `whatsapp_`, not a hardcoded key.

## Quality Requirements

- TypeScript strict mode; no `any` on the payload boundary (validate with zod).
- Idempotent: re-sending the same lead must update, never duplicate.
- Phone normalization helper with unit-testable logic.
- Clear README: how to create the HubSpot private app + token, how to create the
  `wati_*` custom properties, how to point the Wati webhook at `/webhook/wati`, and how
  to run locally (with a note to use a tunnel like ngrok so Wati can reach localhost).
- Graceful errors everywhere; structured `console` logs with a request id.

## Deliverables

- Working repo with `/client` and `/server`, `.env.example`, README, the sample test flow
  wired up, the **editable mapping + create-property-in-HubSpot UI**, and `npm run dev`
  starting both. Mapping persists to `server/data/mapping.json` across restarts.
  Prioritize a correct, runnable webhook→upsert path over UI polish.
