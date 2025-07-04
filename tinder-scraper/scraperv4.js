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

// Global config from env
const TOKENS = process.env.TINDER_TOKENS?.split(',').map(t => t.trim());
if (!TOKENS?.length) throw new Error('TINDER_TOKENS not set');
const CONCURRENCY_PER_TOKEN = parseInt(process.env.CONCURRENCY_PER_TOKEN) || 5;
const PASS_DELAY_MIN_MS = parseInt(process.env.PASS_DELAY_MIN_MS) || 1000;
const PASS_DELAY_MAX_MS = parseInt(process.env.PASS_DELAY_MAX_MS) || 3000;
const BACKOFF_MS = parseInt(process.env.PASS_BACKOFF_MS) || 5000;
const CELL_RADIUS_KM = parseFloat(process.env.CELL_RADIUS_KM) || 10;

// Load cities registry
const cities = JSON.parse(fs.readFileSync(path.join(__dirname, 'cities.json'), 'utf8'));

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/scraperV4.log', maxsize: 10485760, maxFiles: 5 })
  ]
});

// Utility functions
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function shuffle(arr) { for (let i = arr.length; i; i--) { const j = Math.floor(Math.random() * i); [arr[i-1], arr[j]] = [arr[j], arr[i-1]]; } return arr; }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

// Pass (swipe left) with backoff
async function passProfile(userId, tokenIdx) {
  const token = TOKENS[tokenIdx];
  try {
    await axios.get(`https://api.gotinder.com/pass/${userId}`, {
      headers: { 'X-Auth-Token': token }
    });
    logger.info({ event: 'pass', userId });
  } catch (e) {
    if (e.response?.status === 429) {
      logger.warn({ event: 'pass_backoff', userId, tokenIdx });
      await sleep(BACKOFF_MS);
    }
  }
}

// Save profile metadata and photos
async function saveProfile(user, distanceMi, tokenIdx, baseDir) {
  const safe = user.name.replace(/[^\w\s-]/g, '_').trim();
  const dir = path.join(baseDir, `${safe}_${user._id}`);
  ensureDir(dir);

  const metadata = {
    userId: user._id,
    name: user.name,
    birth_date: user.birth_date,
    bio: user.bio,
    gender: user.gender,
    city: user.city?.name || null,
    distance_mi: distanceMi,
    photos: user.photos.map(p => p.url),
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(metadata, null, 2));

  await Promise.all(
    metadata.photos.map((url, idx) => pLimit(CONCURRENCY_PER_TOKEN)(async () => {
      const ext = path.extname(new URL(url).pathname) || '.jpg';
      const outPath = path.join(dir, `photo_${idx+1}${ext}`);
      if (!fs.existsSync(outPath)) {
        try {
          const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
          fs.writeFileSync(outPath, res.data);
          logger.info({ event: 'photo_saved', userId: user._id, index: idx+1 });
        } catch (e) {
          logger.warn({ event: 'photo_failed', userId: user._id, url, message: e.message });
        }
      }
    }))
  );

  await sleep(randInt(PASS_DELAY_MIN_MS, PASS_DELAY_MAX_MS));
  await passProfile(user._id, tokenIdx);
}

// Fetch a single grid cell
async function fetchCell(cell, tokenIdx, baseDir, seen) {
  const token = TOKENS[tokenIdx];
  const ua = ['Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Tinder/WEB',
              'Mozilla/5.0 (Linux; Android 10; SM-G973F) Tinder/WEB',
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Tinder/WEB'][randInt(0,2)];
  logger.info({ event: 'fetch_start', tokenIdx, cell: cell.lat + ',' + cell.lon });
  try {
    const res = await axios.get('https://api.gotinder.com/v2/recs/core', {
      headers: {
        'X-Auth-Token': token,
        'User-Agent': ua,
        'Accept-Language': 'en-US'
      },
      params: {
        locale: 'en',
        lat: cell.lat,
        lon: cell.lon,
        distance_filter: cell.radius,
        count: 100
      },
      timeout: 15000
    });
    const results = res.data.data.results || [];
    logger.info({ event: 'fetch_result', tokenIdx, count: results.length });
    for (const p of results) {
      const id = p.user._id;
      if (!seen.has(id)) {
        seen.add(id);
        await saveProfile(p.user, p.distance_mi, tokenIdx, baseDir);
      }
    }
  } catch (e) {
    if (e.response?.status === 429) {
      logger.warn({ event: 'fetch_backoff', tokenIdx });
      await sleep(BACKOFF_MS);
    } else {
      logger.error({ event: 'fetch_error', tokenIdx, message: e.message });
    }
  }
}

// Main multi-city loop
(async () => {
  for (const job of cities) {
    const { country, city, minLat, maxLat, minLon, maxLon } = job;
    const baseDir = process.env.PROFILES_PATH || path.join(__dirname, '../PROFILES', country, city);
    ensureDir(baseDir);
    logger.info({ event: 'start_city', country, city });

    // Build 3x3 grid with jitter
    const latStep = (maxLat - minLat) / 2;
    const lonStep = (maxLon - minLon) / 2;
    const cells = [];
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        cells.push({
          lat: minLat + dy * latStep + (Math.random() - 0.5) * latStep,
          lon: minLon + dx * lonStep + (Math.random() - 0.5) * lonStep,
          radius: CELL_RADIUS_KM
        });
      }
    }

    const seen = new Set();
    shuffle(cells);
    await Promise.all(
      cells.map((cell, idx) => fetchCell(cell, idx % TOKENS.length, baseDir, seen))
    );

    logger.info({ event: 'sweep_complete', country, city, profiles: seen.size });

    const pauseMs = randInt(30 * 60_000, 2 * 60 * 60_000);
    logger.info({ event: 'city_complete', country, city, pauseBeforeNext: pauseMs });
    await sleep(pauseMs);
  }
  logger.info({ event: 'all_done' });
})();
