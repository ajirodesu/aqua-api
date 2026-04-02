import express from 'express';
import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import compression from 'compression';
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

const isProduction = process.env.NODE_ENV === 'production';

// ──────────────────────────────────────────────────────────────
// Optimized logger (unchanged)
// ──────────────────────────────────────────────────────────────
const logger = {
  info: (message) => console.log(chalk.dim.blue('•') + chalk.dim(' info  - ') + message),
  ready: (message) => console.log(chalk.dim.green('•') + chalk.dim(' ready - ') + message),
  warn: (message) => console.log(chalk.dim.yellow('•') + chalk.dim(' warn  - ') + message),
  error: (message) => console.log(chalk.dim.red('•') + chalk.dim(' error - ') + message),
  event: (message) => console.log(chalk.dim.cyan('•') + chalk.dim(' event - ') + message),
};

// ──────────────────────────────────────────────────────────────
// In-memory notification cache (still the huge win)
// Now fully async for stability under concurrent load
// ──────────────────────────────────────────────────────────────
let notificationsCache = [];

async function loadNotifications() {
  try {
    const raw = await fsPromises.readFile(NOTIF_PATH, 'utf8');
    notificationsCache = JSON.parse(raw);
  } catch (err) {
    // Silent for missing file (normal first run), warn on other errors
    if (err.code !== 'ENOENT') {
      logger.warn(`Failed to load notifications: ${err.message}`);
    }
    notificationsCache = [];
  }
}

async function saveNotifications() {
  try {
    await fsPromises.writeFile(NOTIF_PATH, JSON.stringify(notificationsCache, null, 2));
  } catch (err) {
    logger.error(`Failed to save notifications: ${err.message}`);
  }
}

// ──────────────────────────────────────────────────────────────
// Core Express setup - OPTIMIZED ORDER FOR PERFORMANCE + BANDWIDTH
// ──────────────────────────────────────────────────────────────
logger.info('Starting server initialization...');

app.set('trust proxy', true);
app.set('json spaces', isProduction ? 0 : 2); // compact JSON in production = bandwidth win

// 1. Compression - BIGGEST bandwidth saver (gzip text responses)
app.use(
  compression({
    threshold: 1024, // only compress responses > 1KB
    level: isProduction ? 9 : 6, // max compression in prod
  })
);

// 2. Static assets FIRST (perf + caching)
app.use(
  '/',
  express.static(WEB_DIR, {
    maxAge: isProduction ? 86400000 : 0, // 1 day cache in prod, no cache in dev
    etag: true,
    lastModified: true,
  })
);

// 3. Body parsers AFTER static (static requests skip them entirely)
app.use(express.json({ limit: '1mb' })); // stability: prevent huge payloads
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Middleware: record request start time for accurate responseTime
app.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});

// ──────────────────────────────────────────────────────────────
// Smart JSON response wrapper (unchanged - still clean)
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
// Dynamic endpoint loader (unchanged core logic)
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
// Load all API endpoints from /apis
// ──────────────────────────────────────────────────────────────
logger.info('Loading API endpoints...');
const allEndpoints = await loadEndpointsFromDirectory('apis');
const totalEndpoints = allEndpoints.reduce((total, cat) => total + cat.items.length, 0);
logger.ready(`Loaded ${totalEndpoints} endpoints`);

// ──────────────────────────────────────────────────────────────
// Built-in routes (now benefit from compression + compact JSON)
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

// Admin notification endpoint (now async save)
app.post('/api/notification', async (req, res) => {
  const apiKey = process.env.API_KEY || config.key;
  if (req.headers.authorization !== apiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { message, clear, firstName } = req.body;

  if (clear) {
    notificationsCache = [];
    await saveNotifications();
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
  await saveNotifications();

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
// Final startup (async cache load)
// ──────────────────────────────────────────────────────────────
await loadNotifications(); // ← one-time async cache population

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