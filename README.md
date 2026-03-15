# Aqua API

A modular, self-documenting REST API built with **Node.js** and **Express**. Drop a `.js` file into `apis/` and it registers itself automatically — no routing boilerplate needed. Every response is wrapped with operator metadata, a timestamp, and response time. Ships with an interactive dashboard, live API tester, push notifications, and custom error pages.

> **100% Free** — No API key, no authentication, no payment required. All endpoints are open and ready to use.

---

## Table of Contents

* [Features](#features)
* [Project Structure](#project-structure)
* [Getting Started](#getting-started)
* [Configuration](#configuration)
* [Creating API Modules](#creating-api-modules)
* [Module Meta Reference](#module-meta-reference)
* [Response Format](#response-format)
* [Built-in Routes](#built-in-routes)
* [Notification System](#notification-system)
* [Dashboard](#dashboard)
* [Error Pages](#error-pages)
* [Logging](#logging)
* [Environment Variables](#environment-variables)

---

## Features

* 🆓 **Completely free** — no auth, no API keys, no rate limit paywalls
* 🔌 **Auto-discovery** — modules in `apis/` are scanned and registered on startup, including all subdirectories
* ⚡ **Zero routing boilerplate** — export `meta` and `onStart`, the server handles everything else
* 📦 **Automatic response envelope** — every JSON response gets `operator`, `timestamp`, and `responseTime` injected automatically
* 🌐 **Interactive dashboard** — browse, search, and test every endpoint live from a built-in web UI
* 🔀 **Multi-method support** — a single module can respond to `GET`, `POST`, or combination
* 🔔 **Notification system** — push messages to the dashboard in real time via a protected endpoint
* 🗂️ **Category grouping** — endpoints are automatically grouped by category in the sidebar

---

## Project Structure

```
project-root/
├── apis/
│   ├── ai/                       # category folder
│   ├── random/                   # category folder
│   └── example.js                # API module (example)
├── core/
│   ├── docs/                     # Dashboard and error pages (static)
│   │   ├── err/
│   │   │   ├── 404.html          # Not Found page
│   │   │   └── 500.html          # Internal Server Error page
│   │   ├── docs.html             # Interactive API dashboard
│   │   └── gate.html             # Landing page
│   └── main.js                   # Express server — entry point
├── json/
│   ├── config.json               # App-wide settings
│   └── notif.json                # Notification store (auto-managed)
├── index.js                      # App bootstrap
└── README.md
```

---

## Getting Started

**Prerequisites:** Node.js 18+ (ES module support required)

### 1. Clone the repository

```bash
git clone https://github.com/ajirodesu/aqua-api.git
cd aqua-api
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure the app

Edit `json/config.json` with your project details — see [Configuration](#configuration).

### 4. Start the server

```bash
node index.js
```

The server starts on port `4000` by default. You'll see output like:

```
• info  - Starting server initialization...
• info  - Scanning directory: apis...
• info  - Found subdirectory: Example
• ready - /example/example (Example)
• ready - Loaded 1 endpoints
• ready - Server started successfully
• info  - Local:   http://localhost:4000
• info  - Network: http://192.168.x.x:4000
• info  - Ready for connections
```

### 5. Open the dashboard

Navigate to [`http://localhost:4000/docs`](http://localhost:4000/docs) to browse and live-test all endpoints.

> **Live demo:** [replit.com/@LanceAjiro/aqua-api-2](https://replit.com/@LanceAjiro/aqua-api-2)

---

## Configuration

Edit `json/config.json` to control global app behaviour:

```json
{
  "name": "Aqua API",
  "description": "A free, modular REST API",
  "operator": "AquaDesu",
  "key": "your-secret-key",
  "icon": "/docs/image/icon.png",
  "header": {
    "imageSrc": "/image/banner.png",
    "status": "Online"
  }
}
```

| Field             | Description                                                    |
| ----------------- | -------------------------------------------------------------- |
| `name`            | Displayed in the dashboard title and browser tab               |
| `description`     | Shown in the dashboard hero section                            |
| `operator`        | Injected into every JSON response as `"operator"`              |
| `key`             | Authorization token for the `POST /api/notification` endpoint  |
| `icon`            | Favicon path served by the dashboard                           |
| `header.imageSrc` | Hero image shown in the dashboard (string or array of strings) |
| `header.status`   | Status label shown next to the online indicator dot            |

---

## Creating API Modules

Every `.js` file inside `apis/` that exports a `meta` object and an `onStart` function is automatically discovered and registered as an endpoint on startup.

### Module format

Modules use **named exports** — not a default export:

```js
export const meta = { /* ... */ };
export async function onStart({ req, res }) { /* ... */ }
```

### The built-in example endpoint

```js
// apis/Example/example.js
// Registers as: GET /example/example  and  POST /example/example

export const meta = {
  name: 'example',
  desc: 'A simple example API that echoes back the input text with a greeting',
  method: ['get', 'post'],
  category: 'Example',
  params: [
    {
      name: 'text',
      desc: 'Input your text here',
      example: 'Hello, world!',
      required: true
    }
  ]
};

export async function onStart({ req, res }) {
  let text;

  if (req.method === 'POST') {
    ({ text } = req.body);
  } else {
    ({ text } = req.query);
  }

  if (!text) {
    return res.status(400).json({
      error: 'Missing required parameter: text'
    });
  }

  try {
    const greeting = `Hello, ${text}! This is an example response.`;
    return res.json({ message: greeting });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
}
```

**GET request:**

```
GET /example/example?text=Hello%2C+world!
```

**POST request:**

```bash
curl -X POST http://localhost:4000/example/example \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, world!"}'
```

**Response:**

```json
{
  "operator": "AquaDesu",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "responseTime": "3ms",
  "message": "Hello, world!! This is an example response."
}
```

### Minimal GET module

```js
// apis/greet/hello.js
// Registers as: GET /greet/hello

export const meta = {
  name: 'hello',
  desc: 'Returns a friendly greeting',
  method: 'get',
  category: 'greet',
  params: [
    {
      name: 'name',
      desc: 'The name to greet',
      example: 'world',
      required: false
    }
  ]
};

export async function onStart({ req, res }) {
  const { name = 'world' } = req.query;
  return res.json({ message: `Hello, ${name}!` });
}
```

### Multi-method module

```js
// apis/tools/ping.js
// Responds to GET and POST /tools/ping

export const meta = {
  name: 'ping',
  desc: 'Simple connectivity check',
  method: ['get', 'post'],
  category: 'tools'
};

export async function onStart({ req, res }) {
  return res.json({ pong: true, method: req.method });
}
```

### Dropdown param (select input in dashboard)

```js
export const meta = {
  name: 'convert',
  desc: 'Convert a value between units',
  method: 'get',
  category: 'tools',
  params: [
    {
      name: 'unit',
      desc: 'Target unit',
      example: 'kg',
      required: true,
      options: ['kg', 'lb', 'g', 'oz']   // renders as a <select> in the dashboard
    },
    {
      name: 'value',
      desc: 'Numeric value to convert',
      example: '100',
      required: true
    }
  ]
};
```

### How routing works

The route path is built from two parts:

1. **Category slug** — the `category` field in `meta`, lowercased with spaces replaced by `-`
2. **File name** — the `.js` filename without the extension

| File path                  | `category` | Registered route   |
| -------------------------- | ---------- | ------------------ |
| `apis/Example/example.js`  | `Example`  | `/example/example` |
| `apis/Image/generate.js`   | `Image`    | `/image/generate`  |
| `apis/tools/ping.js`       | `tools`    | `/tools/ping`      |

---

## Module Meta Reference

| Field      | Type                 | Required | Description                                                               |
| ---------- | -------------------- | -------- | ------------------------------------------------------------------------- |
| `name`     | `string`             | ✓        | Display name shown in the dashboard sidebar                               |
| `desc`     | `string`             |          | Short description shown below the name                                    |
| `category` | `string`             |          | Groups the endpoint in the sidebar. Defaults to the parent directory name |
| `method`   | `string \| string[]` |          | HTTP method(s). Defaults to `"GET"`. Case-insensitive                     |
| `params`   | `Param[]`            |          | Parameters shown and used in the dashboard tester                         |

### Param object

| Field      | Type       | Description                                                    |
| ---------- | ---------- | -------------------------------------------------------------- |
| `name`     | `string`   | Parameter key name                                             |
| `desc`     | `string`   | Description shown in the dashboard                             |
| `example`  | `any`      | Placeholder / default value shown in the input field           |
| `required` | `boolean`  | Marks the field as required in the UI                          |
| `options`  | `string[]` | If provided, renders a dropdown select instead of a text input |

---

## Response Format

Every `res.json()` call is automatically wrapped with metadata before being sent. You never need to add these fields yourself.

```json
{
  "operator": "AquaDesu",
  "timestamp": "2025-01-01T12:00:00.000Z",
  "responseTime": "4ms",
  "...your fields here..."
}
```

| Field          | Description                                                  |
| -------------- | ------------------------------------------------------------ |
| `operator`     | Value of `config.operator` from `json/config.json`           |
| `timestamp`    | ISO 8601 UTC timestamp of response generation                |
| `responseTime` | Time from request received to response sent, in milliseconds |

---

## Built-in Routes

These routes are registered by the server itself and are always available.

| Method | Path                | Description                                                    |
| ------ | ------------------- | -------------------------------------------------------------- |
| `GET`  | `/`                 | Serves the landing page                                        |
| `GET`  | `/docs`             | Serves the interactive API dashboard                           |
| `GET`  | `/endpoints`        | Returns all registered endpoints as JSON                       |
| `GET`  | `/set`              | Returns app config and current notifications                   |
| `GET`  | `/notifications`    | Returns the current notification list                          |
| `POST` | `/api/notification` | Push or clear a notification (requires `Authorization` header) |

### `GET /endpoints` response shape

```json
{
  "operator": "AquaDesu",
  "timestamp": "...",
  "responseTime": "...",
  "status": true,
  "count": 1,
  "endpoints": [
    {
      "name": "Example",
      "items": [
        {
          "name": "example",
          "desc": "A simple example API that echoes back the input text with a greeting",
          "path": "/example/example?text=",
          "methods": ["GET", "POST"]
        }
      ]
    }
  ]
}
```

---

## Notification System

Notifications appear in the dashboard's bell icon. They are persisted to `json/notif.json` and survive server restarts.

### Push a notification

```bash
curl -X POST http://localhost:4000/api/notification \
  -H "Content-Type: application/json" \
  -H "Authorization: your-secret-key" \
  -d '{"message": "v2.0 is now live!", "firstName": "Dev"}'
```

**Response:**

```json
{
  "operator": "AquaDesu",
  "timestamp": "...",
  "responseTime": "...",
  "success": true
}
```

### Clear all notifications

```bash
curl -X POST http://localhost:4000/api/notification \
  -H "Content-Type: application/json" \
  -H "Authorization: your-secret-key" \
  -d '{"clear": true}'
```

### Request body fields

| Field       | Type      | Description                                                            |
| ----------- | --------- | ---------------------------------------------------------------------- |
| `message`   | `string`  | The notification body text                                             |
| `firstName` | `string`  | Optional sender name — appears in the title as `From Developer <name>` |
| `clear`     | `boolean` | If `true`, deletes all existing notifications and ignores `message`    |

> **Authorization:** The `Authorization` header value must exactly match the `key` field in `json/config.json`. Requests with an invalid or missing key receive `401 Unauthorized`.

---

## Dashboard

Accessible at `/docs`. Explore and test the entire API without any external tools.

| Feature                  | Description                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------- |
| **Sidebar**              | All categories and endpoints, with live search across names and descriptions        |
| **API Tester**           | Fill in parameters and send live requests directly from the browser                 |
| **Response viewer**      | JSON with syntax highlighting; inline render for images, video, and audio responses |
| **Download button**      | Appears automatically when the response is a media or binary file                   |
| **Base URL card**        | One-click copy of the root API URL                                                  |
| **Example endpoint**     | A randomly selected live API shown on the home page each load                       |
| **Response format card** | Documents the standard envelope fields                                              |
| **Error code reference** | HTTP status quick-reference (200, 400, 404, 429, 500)                               |
| **Notifications panel**  | Bell icon in the header shows messages pushed via the notification endpoint         |

---

## Error Pages

| File                     | Triggered when                                          |
| ------------------------ | ------------------------------------------------------- |
| `core/docs/err/404.html` | A request matches no registered route                   |
| `core/docs/err/500.html` | An unhandled exception occurs during request processing |

Both pages automatically display the requested path, include navigation back to the dashboard, and share the full Aqua API design system.

---

## Logging

All server events are printed to the console with colour-coded prefixes via `chalk`.

| Prefix    | Colour | When it appears                                      |
| --------- | ------ | ---------------------------------------------------- |
| `• info`  | Blue   | General messages — scanning directories, server URLs |
| `• ready` | Green  | A route registered successfully, server started      |
| `• warn`  | Yellow | Non-fatal issues — missing directory, skipped file   |
| `• error` | Red    | Failed module load, unhandled request error          |
| `• event` | Cyan   | Runtime events                                       |

---

## Environment Variables

| Variable | Default | Description                     |
| -------- | ------- | ------------------------------- |
| `PORT`   | `4000`  | HTTP port the server listens on |

```bash
PORT=8080 node index.js
```

---

## License

Aqua API is free to use. No payment, no API key, no account required.