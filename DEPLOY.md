# Deploying to Hostinger (Node.js)

This app runs as a **single Node.js process**: the Express server serves both the
JSON API and the built React dashboard (`client/dist`) from the same origin.

## 1. Get the code onto Hostinger

In **hPanel → Websites → Manage → Advanced → SSH Access**, then via SSH:

```bash
cd ~/domains/<your-domain>   # or wherever your app should live
git clone https://github.com/sravan-dev/wati-pro.git
cd wati-pro
```

(Or use the Git deployment tool in hPanel pointed at this repo.)

## 2. Create the Node.js application

In **hPanel → Advanced → Node.js**:

- **Application root:** the `wati-pro` folder you cloned above
- **Application startup file:** `app.js`
- **Node.js version:** 18 or newer

## 3. Set environment variables

The real secrets live in `.env`, which is **not** committed. Create it on the server
(copy `.env.example` and fill in real values), or set the same keys in the Node.js
app's **Environment variables** panel in hPanel:

```
HUBSPOT_ACCESS_TOKEN=pat-...
WATI_WEBHOOK_SECRET=...
WATI_API_ENDPOINT=https://...        # optional, for listing Wati contacts
WATI_API_TOKEN=...                   # optional
# PORT is provided automatically by Hostinger — do not hardcode it.
```

## 4. Install and build

From the Node.js panel use **Run NPM Install**, then run the build. Via SSH:

```bash
npm install        # installs server + client deps (workspaces)
npm run build      # compiles server -> server/dist and client -> client/dist
```

> The build needs devDependencies (TypeScript, Vite). If your environment sets
> `NODE_ENV=production`, run `npm install --include=dev` so the build tools install.

## 5. Start / restart

Click **Restart** in the Node.js panel. Passenger runs `app.js`, which boots
`server/dist/index.js`.

Verify:

- `https://<your-domain>/` → the dashboard loads
- `https://<your-domain>/health` → `{"hubspot":true,"webhookSecretSet":true}`

## 6. Point the Wati webhook at it

Set the Wati webhook URL to:

```
https://<your-domain>/webhook/wati?secret=<WATI_WEBHOOK_SECRET>
```

## Updating later

```bash
git pull
npm install
npm run build
# then Restart in the Node.js panel
```
