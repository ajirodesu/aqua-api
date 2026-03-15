# Aqua API

A simple REST API built with Node.js + Express (ESM modules), migrated from Vercel to Replit.

## Architecture

- **Entry point**: `index.js` — spawns `core/main.js` as a child process
- **Server**: `core/main.js` — Express server with dynamic route loading
- **API routes**: `apis/` directory — auto-loaded at startup
  - `apis/ai/` — AI-related endpoints (aiart, chatgptfree, copilot, depimg, goody, venice, webpilot)
  - `apis/random/` — Random endpoints (ba, cosplay)
- **Config**: `json/config.json` — app metadata and defaults
- **Notifications**: `json/notif.json` — persistent notification storage

## Port & Workflow

- Runs on port **3000** (mapped to external port 80)
- Workflow: `node index.js`

## Security

- The `/api/notification` POST endpoint is protected by an `Authorization` header check
- The API key is read from the `API_KEY` environment secret (falls back to `config.json` key if not set)
- Set the `API_KEY` secret in Replit Secrets for production use

## Adding New Endpoints

Each file in `apis/<category>/` must export a default object with:
- `meta` — object with `category`, `method`, `params`, etc.
- `onStart({ req, res })` — async handler function

The server auto-discovers and registers all such files at startup.
