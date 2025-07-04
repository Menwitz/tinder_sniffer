// scraperv2.js — High‑throughput Tinder city scraper (GET version with locale)
// 📦 Usage: node scraper.js
// 📋 Prerequisites:
//   - Create a .env file in project root with:
//       TINDER_TOKENS="token1,token2"
//       PROXIES="http://user:pass@proxy1:port,http://proxy2:port"  # optional
//       MIN_LAT=48.80
//       MAX_LAT=48.92
//       MIN_LON=2.25
//       MAX_LON=2.45
//       CELL_RADIUS_KM=10
//       CONCURRENCY_PER_TOKEN=20
//   - Install deps: npm install dotenv axios p-limit node-fetch
//   - Run: node scraper.js
//   - Check: ../PROFILES/ directory for saved profiles
//   - Note: This script is for educational purposes only. Use responsibly.
//   - Note: This script is not affiliated with Tinder. Use at your own risk.
//   - Note: This script is not intended for production use. Use at your own risk.
//   - Note: This script is not intended for commercial use. Use at your own risk.
//   - Note: This script is not intended for malicious use. Use at your own risk.
//   - Note: This script is not intended for scraping Tinder. Use at your own risk.
//   - Note: This script is not intended for violating Tinder's terms of service. Use at your own risk.
//   - Note: This script is not intended for violating Tinder's privacy policy. Use at your own risk.
//   - Note: This script is not intended for violating Tinder's copyright. Use at your own risk.
//   - Note: This script is not intended for violating Tinder's trademark. Use at your own risk.
//   - Note: This script is not intended for violating Tinder's intellectual property. Use at your own risk.
//   - Note: This script is not intended for violating Tinder's user agreement. Use at your own risk.
//   - Note: This script is not intended for violating Tinder's community guidelines. Use at your own risk. 

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import pLimit from 'p-limit';
import winston from 'winston';

// ES module __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// Configuration from .env
const TOKENS = process.env.TINDER_TOKENS?.split(',').map(t => t.trim());
if (!TOKENS?.length) throw new Error('TINDER_TOKENS not set');
const CONCURRENCY_PER_TOKEN = parseInt(process.env.CONCURRENCY_PER_TOKEN) || 5;
const TOTAL_CONCURRENCY = CONCURRENCY_PER_TOKEN * TOKENS.length;
const PASS_DELAY_MIN_MS = parseInt(process.env.PASS_DELAY_MIN_MS) || 100;
const PASS_DELAY_MAX_MS = parseInt(process.env.PASS_DELAY_MAX_MS) || 300;
const BACKOFF_MS = parseInt(process.env.PASS_BACKOFF_MS) || 5000;
const CELL_RADIUS_KM = parseFloat(process.env.CELL_RADIUS_KM) || 10;

// Load city bounding boxes
const cities = JSON.parse(fs.readFileSync(path.join(__dirname, 'cities.json'), 'utf8'));

// Logger setup with colored console and JSON file
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, country, city, tokenIdx, ...meta }) => {
    const loc = country && city ? `${country}/${city}` : '';
    const tk = tokenIdx !== undefined ? ` token#${tokenIdx}` : '';
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    return `${timestamp} [${level}]${loc ? ` [${loc}]` : ''}${tk} ${msg}`;
  })
);
const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({
      filename: 'logs/scraperV4.log', maxsize: 10485760, maxFiles: 5,
      format: winston.format.combine(winston.format.timestamp(), winston.format.json())
    })
  ]
});

// Helpers
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function shuffle(arr) { for (let i = arr.length; i; ) { const j = Math.floor(Math.random() * i); [arr[i-1], arr[j]] = [arr[j], arr[i-1]]; i--; } return arr; }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

// User-Agent pool
const USER_AGENTS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Tinder/WEB',
  'Mozilla/5.0 (Linux; Android 10; SM-G973F) Tinder/WEB',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Tinder/WEB'
];

// Swipe-left (pass) with rate-limit backoff
async function passProfile(userId, tokenIdx, locLogger) {
  const token = TOKENS[tokenIdx];
  try {
    await axios.get(`https://api.gotinder.com/pass/${userId}`, { headers: { 'X-Auth-Token': token } });
    locLogger.info(`pass ${userId}`, { tokenIdx });
  } catch (e) {
    if (e.response?.status === 429) {
      locLogger.warn(`pass_backoff ${userId}`, { tokenIdx, backoffMs: BACKOFF_MS });
      await sleep(BACKOFF_MS);
    }
  }
}

// Save profile and photos
async function saveProfile(user, distanceMi, tokenIdx, baseDir, locLogger, seen) {
  const safe = user.name.replace(/[^\w\s-]/g, '_').trim();
  const dir = path.join(baseDir, `${safe}_${user._id}`);
  ensureDir(dir);

  const metadata = {
    userId: user._id, name: user.name, birth_date: user.birth_date,
    bio: user.bio, gender: user.gender, city: user.city?.name || null,
    distance_mi: distanceMi, photos: user.photos.map(p => p.url),
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(metadata, null, 2));

  const limit = pLimit(CONCURRENCY_PER_TOKEN);
  await Promise.all(metadata.photos.map((url, idx) => limit(async () => {
    try {
      const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
      const ext = path.extname(new URL(url).pathname) || '.jpg';
      fs.writeFileSync(path.join(dir, `photo_${idx+1}${ext}`), res.data);
      locLogger.info(`photo_saved ${user._id}`, { tokenIdx, index: idx+1 });
    } catch (e) {
      locLogger.warn(`photo_failed ${user._id}`, { tokenIdx, url, message: e.message });
    }
  })));

  await sleep(randInt(PASS_DELAY_MIN_MS, PASS_DELAY_MAX_MS));
  await passProfile(user._id, tokenIdx, locLogger);
  locLogger.info(`profile_saved ${user._id}`, { tokenIdx, totalProfiles: seen.size });
}

// Fetch recommendations for one cell
async function fetchCell(cell, tokenIdx, baseDir, seen, locLogger) {
  const token = TOKENS[tokenIdx];
  const ua = USER_AGENTS[randInt(0, USER_AGENTS.length - 1)];
  locLogger.info(`fetch_start cell=${cell.lat},${cell.lon}`, { tokenIdx });
  try {
    const res = await axios.get('https://api.gotinder.com/v2/recs/core', {
      headers: { 'X-Auth-Token': token, 'User-Agent': ua },
      params: { locale: 'en', lat: cell.lat, lon: cell.lon, distance_filter: CELL_RADIUS_KM, count: 100 },
      timeout: 15000
    });
    const results = res.data.data.results || [];
    locLogger.info(`fetch_result ${results.length}`, { tokenIdx });
    for (const p of results) {
      if (!seen.has(p.user._id)) {
        seen.add(p.user._id);
        await saveProfile(p.user, p.distance_mi, tokenIdx, baseDir, locLogger, seen);
      }
    }
  } catch (e) {
    if (e.response?.status === 429) {
      locLogger.warn('fetch_backoff', { tokenIdx });
      await sleep(BACKOFF_MS);
    } else {
      locLogger.error('fetch_error', { tokenIdx, message: e.message });
    }
  }
}

// Main multi-city scraper loop
(async () => {
  let globalTotal = 0;
  for (const job of cities) {
    const { country, city, minLat, maxLat, minLon, maxLon } = job;
    const baseDir = process.env.PROFILES_PATH || path.join(__dirname, '../PROFILES', country, city);
    ensureDir(baseDir);
    const locLogger = logger.child({ country, city });
    locLogger.info('start_city');

    // Build 3×3 jittered grid
    const latStep = (maxLat - minLat) / 2;
    const lonStep = (maxLon - minLon) / 2;
    const cells = [];
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        cells.push({
          lat: minLat + dy * latStep + (Math.random() - 0.5) * latStep,
          lon: minLon + dx * lonStep + (Math.random() - 0.5) * lonStep
        });
      }
    }

    locLogger.info('grid_cells', { total: cells.length });

    const seen = new Set();
    shuffle(cells);

    const limitGlob = pLimit(TOTAL_CONCURRENCY);
    await Promise.all(cells.map((cell, idx) => limitGlob(async () => {
      await fetchCell(cell, idx % TOKENS.length, baseDir, seen, locLogger);
      locLogger.info('cell_complete', { index: idx+1 });
    })));

    locLogger.info('sweep_complete', { profilesScraped: seen.size });
    globalTotal += seen.size;

    // Minimal pause
    const pauseMs = randInt(1000, 5000);
    locLogger.info('city_complete', { pauseBeforeNext: pauseMs });
    await sleep(pauseMs);
  }
  logger.info('all_done', { globalProfiles: globalTotal });
})();
