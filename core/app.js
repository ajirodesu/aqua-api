// core/app.js
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import config from '../json/config.json' with { type: 'json' };
import { fileURLToPath, pathToFileURL } from 'node:url';
import { networkInterfaces } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);   // ← core/ folder
const rootDir = path.join(__dirname, '..');   // ← project root

// Pre-computed paths (DRY + tiny perf win)
const WEB_DIR = path.join(__dirname, 'web');
const JSON_DIR = path.join(rootDir, 'json');
const NOTIF_PATH = path.join(JSON_DIR, 'notif.json');

const app = express();
const PORT = process.env.PORT || 3000;

// ──────────────────────────────────────────────────────────────
// Optimized logger (same output, slightly cleaner internals)
// ──────────────────────────────────────────────────────────────
const logger = {
  info: (message) => console.log(chalk.dim.blue('•') + chalk.dim(' info  - ') + message),
  ready: (message) => console.log(chalk.dim.green('•') + chalk.dim(' ready - ') + message),
  warn: (message) => console.log(chalk.dim.yellow('•') + chalk.dim(' warn  - ') + message),
  error: (message) => console.log(chalk.dim.red('•') + chalk.dim(' error - ') + message),
  event: (message) => console.log(chalk.dim.cyan('•') + chalk.dim(' event - ') + message),
};

// ──────────────────────────────────────────────────────────────
// In-memory notification cache (huge win: no FS read on every request)
// Loaded once at startup, updated only on POST /api/notification
// ──────────────────────────────────────────────────────────────
let notificationsCache = [];

function loadNotifications() {
  try {
    const raw = fs.readFileSync(NOTIF_PATH, 'utf8');
    notificationsCache = JSON.parse(raw);
  } catch {
    notificationsCache = []; // file missing or invalid → start fresh
  }
}

function saveNotifications() {
  try {
    fs.writeFileSync(NOTIF_PATH, JSON.stringify(notificationsCache, null, 2));
  } catch (err) {
    logger.error(`Failed to save notifications: ${err.message}`);
  }
}

// ──────────────────────────────────────────────────────────────
// Core Express setup
// ──────────────────────────────────────────────────────────────
app.set('trust proxy', true);
app.set('json spaces', 2);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static assets from core/web (fast path)
app.use('/', express.static(WEB_DIR));

// Middleware: record request start time for accurate responseTime
app.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});

logger.info('Starting server initialization...');

// ──────────────────────────────────────────────────────────────
// Smart JSON response wrapper (auto-injects operator, timestamp, responseTime)
// Fixed: no longer corrupts arrays by spreading them
// ──────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (data) {
    const now = new Date();
    const timestamp = now.toISOString();
    const responseTime = `${Date.now() - req.startTime}ms`;

    // Only wrap plain objects (arrays, primitives, null are left untouched)
    if (data && typeof data === 'object' && !Array.isArray(data) && data !== null) {
      const wrapped = {
        operator: config.operator || '',
        timestamp,
        responseTime,
        ...data,
      };
      return originalJson.call(this, wrapped);
    }

    return originalJson.call(this, data);
  };
  next();
});

// ──────────────────────────────────────────────────────────────
// Dynamic endpoint loader (unchanged core logic, just cleaner)
// ──────────────────────────────────────────────────────────────
async function loadEndpointsFromDirectory(directory, categoryPath = '') {
  let endpoints = [];
  const fullPath = path.join(rootDir, directory);

  if (!fs.existsSync(fullPath)) {
    logger.warn(`Directory not found: ${fullPath}`);
    return endpoints;
  }

  logger.info(`Scanning directory: ${directory}...`);

  for (const item of fs.readdirSync(fullPath)) {
    const itemPath = path.join(fullPath, item);
    const stats = fs.statSync(itemPath);

    if (stats.isDirectory()) {
      const subCategory = categoryPath ? `${categoryPath}/${item}` : item;
      logger.info(`Found subdirectory: ${item}`);
      endpoints = endpoints.concat(
        await loadEndpointsFromDirectory(path.join(directory, item), subCategory)
      );
    } else if (stats.isFile() && item.endsWith('.js')) {
      try {
        const itemURL = pathToFileURL(itemPath).href;
        const modImport = await import(itemURL);
        const mod = modImport.default ?? modImport;

        if (mod && typeof mod.onStart === 'function') {
          const name = item.replace('.js', '');
          const cat = mod.meta.category || (categoryPath || 'other');
          const catSlug = cat.toLowerCase().replace(/[\ /]/g, '-');
          const route = `/${catSlug}/${name}`;

          // Register handler (kept as app.all for full compatibility with existing modules)
          app.all(route, async (req, res, next) => {
            try {
              await mod.onStart({ req, res });
            } catch (err) {
              next(err);
            }
          });

          let displayPath = route;
          if (mod.meta.params?.length) {
            displayPath += '?' + mod.meta.params.map(p => `${p.name}=`).join('&');
          }

          // Group by category for /endpoints docs
          let bucket = endpoints.find(e => e.name === cat);
          if (!bucket) {
            bucket = { name: cat, items: [] };
            endpoints.push(bucket);
          }

          const methods = Array.isArray(mod.meta.method)
            ? mod.meta.method.map(m => m.toUpperCase())
            : [mod.meta.method?.toUpperCase() || 'GET'];

          bucket.items.push({
            ...mod.meta,
            path: displayPath,
            methods,
          });

          logger.ready(
            `${chalk.green(route)} ${chalk.dim('(')}${chalk.cyan(cat)}${chalk.dim(')')}`
          );
        }
      } catch (error) {
        logger.error(`Failed to load module ${itemPath}: ${error.message}`);
      }
    }
  }
  return endpoints;
}

// ──────────────────────────────────────────────────────────────
// Static routes
// ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(WEB_DIR, 'gate.html')));
app.get('/docs', (req, res) => res.sendFile(path.join(WEB_DIR, 'docs.html')));

// ──────────────────────────────────────────────────────────────
// Load all API endpoints from /apis (top-level await is perfect here)
// ──────────────────────────────────────────────────────────────
logger.info('Loading API endpoints...');
const allEndpoints = await loadEndpointsFromDirectory('apis');
const totalEndpoints = allEndpoints.reduce((total, cat) => total + cat.items.length, 0);
logger.ready(`Loaded ${totalEndpoints} endpoints`);

// ──────────────────────────────────────────────────────────────
// Built-in routes (now using cached notifications)
// ──────────────────────────────────────────────────────────────
app.get('/endpoints', (req, res) => {
  res.json({
    status: true,
    count: totalEndpoints,
    endpoints: allEndpoints,
  });
});

app.get('/set', (req, res) => {
  res.json({
    status: true,
    ...config,
    notification: notificationsCache,
  });
});

app.get('/notifications', (req, res) => {
  res.json({ notifications: notificationsCache });
});

// Admin notification endpoint
app.post('/api/notification', async (req, res) => {
  const apiKey = process.env.API_KEY || config.key;
  if (req.headers.authorization !== apiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { message, clear, firstName } = req.body;

  if (clear) {
    notificationsCache = [];
    saveNotifications();
    return res.json({ success: true, cleared: true });
  }

  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  const newNotif = {
    id: Date.now(),
    title: `From Developer ${firstName || ''}`.trim(),
    message: message.trim(),
    createdAt: Date.now(),
  };

  notificationsCache.push(newNotif);
  saveNotifications();

  res.json({ success: true });
});

// ──────────────────────────────────────────────────────────────
// Error handlers (last)
// ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  logger.info(`404: ${req.method} ${req.path}`);
  res.status(404).sendFile(path.join(WEB_DIR, 'err', '404.html'));
});

app.use((err, req, res, next) => {
  logger.error(`500: ${err.message}`);
  res.status(500).sendFile(path.join(WEB_DIR, 'err', '500.html'));
});

// ──────────────────────────────────────────────────────────────
// Final startup
// ──────────────────────────────────────────────────────────────
loadNotifications(); // ← one-time cache population

app.listen(PORT, () => {
  logger.ready(`Server started successfully`);
  logger.info(`Local:   ${chalk.cyan(`http://localhost:${PORT}`)}`);

  try {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          logger.info(`Network: ${chalk.cyan(`http://${net.address}:${PORT}`)}`);
        }
      }
    }
  } catch (error) {
    logger.warn(`Cannot detect network interfaces: ${error.message}`);
  }

  logger.info(`${chalk.dim('Ready for connections')}`);
});

export default app;