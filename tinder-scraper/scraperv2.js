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
import winston from 'winston';
dotenv.config();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/scraperV2.log', maxsize: 10485760, maxFiles: 5 })
  ]
});

import axios from 'axios';
import pLimit from 'p-limit';
import fs from 'fs';
import path from 'path';
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

// scraper V2
const TOKENS = process.env.TINDER_TOKENS?.split(',').map(t => t.trim());
if (!TOKENS?.length) throw new Error('Set TINDER_TOKENS in .env');
const PROXIES = process.env.PROXIES?.split(',').map(p => p.trim()) || [];
const MIN_LAT = parseFloat(process.env.MIN_LAT);
const MAX_LAT = parseFloat(process.env.MAX_LAT);
const MIN_LON = parseFloat(process.env.MIN_LON);
const MAX_LON = parseFloat(process.env.MAX_LON);
if ([MIN_LAT, MAX_LAT, MIN_LON, MAX_LON].some(isNaN)) throw new Error('Set MIN_LAT,MAX_LAT,MIN_LON,MAX_LON in .env');
const CELL_RADIUS_KM = parseFloat(process.env.CELL_RADIUS_KM) || 10;
const CONCURRENCY_PER_TOKEN = parseInt(process.env.CONCURRENCY_PER_TOKEN) || 20;
const SWEEP_PAUSE_MS = parseInt(process.env.SWEEP_PAUSE_MS) || 5000;
const LIMIT = CONCURRENCY_PER_TOKEN * TOKENS.length;
const limit = pLimit(LIMIT);

const seen = new Set();
const LAT_STEP = CELL_RADIUS_KM / 111;
const MID_LAT = (MIN_LAT + MAX_LAT) / 2;
const LON_STEP = CELL_RADIUS_KM / (111 * Math.cos(MID_LAT * Math.PI / 180));

const cells = [];
for (let lat = MIN_LAT; lat <= MAX_LAT; lat += LAT_STEP) {
  for (let lon = MIN_LON; lon <= MAX_LON; lon += LON_STEP) {
    cells.push({ lat, lon, key: `${lat.toFixed(6)},${lon.toFixed(6)}` });
  }
}

const state = {};
cells.forEach(c => state[c.key] = { s: null, cold: 0 });

const USER_AGENTS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Tinder/WEB',
  'Mozilla/5.0 (Linux; Android 10; SM-G973F) Tinder/WEB',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Tinder/WEB'
];

function shuffle(array) {
  for (let i = array.length; i; i--) {
    const j = Math.floor(Math.random() * i);
    [array[i - 1], array[j]] = [array[j], array[i - 1]];
  }
  return array;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function passProfile(userId, token, sNumber, contentHash) {
  try {
    await axios.get(`https://api.gotinder.com/pass/${userId}`, {
      headers: { 'X-Auth-Token': token },
      params: { locale: 'en', s_number: sNumber, content_hash: contentHash }
    });
    logger.info({ event: 'pass', userId });
  } catch (e) {
    logger.warn({ event: 'pass_error', userId, message: e.message });
  }
}

async function fetchCell(cell) {
  const token = TOKENS.shift(); TOKENS.push(token);
  const proxy = PROXIES.length ? PROXIES.shift() : null;
  if (proxy) PROXIES.push(proxy);

  const jitterLat = cell.lat + (Math.random() * 2 - 1) * (CELL_RADIUS_KM / 111);
  const jitterLon = cell.lon + (Math.random() * 2 - 1) * (CELL_RADIUS_KM / (111 * Math.cos(MID_LAT * Math.PI / 180)));
  const params = { locale: 'en', lat: jitterLat, lon: jitterLon, distance: CELL_RADIUS_KM, count: 100 };
  if (state[cell.key].s) params.s_number = state[cell.key].s;

  logger.info({ event: 'fetch_start', cell: cell.key, lat: jitterLat, lon: jitterLon });
  const start = Date.now();

  try {
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const client = axios.create({
      timeout: 15000,
      headers: { 'X-Auth-Token': token, 'accept-language': 'en', 'User-Agent': ua },
      proxy: proxy ? new URL(proxy) : false
    });
    const response = await client.get('https://api.gotinder.com/v2/recs/core', { params });

    const data = response.data.data;
    state[cell.key].s = data.s_number || state[cell.key].s;
    const results = data.results || [];
    const newProfiles = results.filter(p => !seen.has(p.user._id));
    const duration = Date.now() - start;

    logger.info({ event: 'fetch_result', cell: cell.key, count: newProfiles.length, duration });
    if (!newProfiles.length) { state[cell.key].cold++; return; }
    state[cell.key].cold = 0;

    for (const p of newProfiles) {
      if (seen.has(p.user._id)) continue;
      seen.add(p.user._id);
      await saveProfile(p.user, p.distance_mi, p.s_number, p.content_hash, token);
    }
  } catch (error) {
    if (error.response?.status === 429) {
      logger.warn({ event: 'rate_limited', cell: cell.key });
    } else {
      logger.error({ event: 'fetch_error', cell: cell.key, message: error.message });
    }
  }
}

async function saveProfile(user, distanceMi, sNumber, contentHash, token) {
  const safeName = user.name.replace(/[^\w\s-]/g, '_').trim();
  const dir = path.join('../PROFILES/', `${safeName}_${user._id}`);
  ensureDir(dir);

  const metadata = {
    userId: user._id,
    name: user.name,
    birth_date: user.birth_date,
    bio: user.bio,
    gender: user.gender,
    jobs: user.jobs,
    schools: user.schools,
    city: user.city?.name || null,
    distance_mi: distanceMi,
    distance_km: distanceMi ? Math.round(distanceMi * 1.60934 * 10) / 10 : null,
    s_number: sNumber,
    content_hash: contentHash,
    photos: user.photos.map(img => img.url),
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(metadata, null, 2));
  await Promise.all(
    metadata.photos.map((url, i) => limit(async () => {
      try {
        const res = await fetch(url);
        const arrayBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        const ext = path.extname(url).split('?')[0] || '.jpg';
        fs.writeFileSync(path.join(dir, `photo_${i+1}${ext}`), buf);
      } catch {}
    }))
  );

  logger.info({ event: 'profile_saved', userId: user._id, total: seen.size });
  await passProfile(user._id, token, sNumber, contentHash);
}

function gracefulShutdown() {
  logger.info({ event: 'done', totalProfiles: seen.size });
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

(async () => {
  logger.info({ event: 'start', totalCells: cells.length });
  while (true) {
    shuffle(cells);
    const activeCells = cells.filter(c => state[c.key].cold < 3);
    logger.info({ event: 'sweep_start', activeCells: activeCells.length });

    await Promise.all(
      activeCells.map(cell =>
        limit(async () => {
          await fetchCell(cell);
          const delay = 400 + Math.random() * 200;
          logger.info({ event: 'cell_pause', cell: cell.key, delay });
          await sleep(delay);
        })
      )
    );

    logger.info({ event: 'sweep_complete', totalProfiles: seen.size });
    logger.info({ event: 'sweep_pause', duration: SWEEP_PAUSE_MS });
    await sleep(SWEEP_PAUSE_MS);
  }
})();
