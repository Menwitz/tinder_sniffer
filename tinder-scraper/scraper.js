// scraper.js — High‑throughput Tinder city scraper (GET version with locale)
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

import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import pLimit from 'p-limit';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
const TOKENS = process.env.TINDER_TOKENS?.split(',').map(t => t.trim());
if (!TOKENS || TOKENS.length === 0) {
  throw new Error('Set TINDER_TOKENS in .env');
}
const PROXIES = process.env.PROXIES?.split(',').map(p => p.trim()) || [];
const MIN_LAT = parseFloat(process.env.MIN_LAT);
const MAX_LAT = parseFloat(process.env.MAX_LAT);
const MIN_LON = parseFloat(process.env.MIN_LON);
const MAX_LON = parseFloat(process.env.MAX_LON);
if ([MIN_LAT, MAX_LAT, MIN_LON, MAX_LON].some(isNaN)) {
  throw new Error('Set MIN_LAT, MAX_LAT, MIN_LON, MAX_LON in .env');
}
const CELL_RADIUS_KM = parseFloat(process.env.CELL_RADIUS_KM) || 10;
const CONCURRENCY_PER_TOKEN = parseInt(process.env.CONCURRENCY_PER_TOKEN) || 20;
const TOTAL_CONCURRENCY = TOKENS.length * CONCURRENCY_PER_TOKEN;
const limit = pLimit(TOTAL_CONCURRENCY);
const seenIds = new Set();
const LAT_STEP = CELL_RADIUS_KM / 111;
const MID_LAT = (MIN_LAT + MAX_LAT) / 2;
const LON_STEP = CELL_RADIUS_KM / (111 * Math.cos(MID_LAT * Math.PI / 180));
const cells = [];
for (let lat = MIN_LAT; lat <= MAX_LAT; lat += LAT_STEP) {
  for (let lon = MIN_LON; lon <= MAX_LON; lon += LON_STEP) {
    cells.push({ lat, lon });
  }
}
console.log(`Generated ${cells.length} cells`);
let tokenIdx = 0;
let proxyIdx = 0;
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
async function fetchCell({ lat, lon }) {
  const token = TOKENS[tokenIdx++ % TOKENS.length];
  const proxyUrl = PROXIES.length ? PROXIES[proxyIdx++ % PROXIES.length] : null;
  try {
    const client = axios.create({
      timeout: 15000,
      headers: {
        'X-Auth-Token': token,
        'accept-language': 'en',
        'User-Agent': 'Mozilla/5.0 Tinder/WEB'
      },
      proxy: proxyUrl ? new URL(proxyUrl) : false
    });
    const resp = await client.get('https://api.gotinder.com/v2/recs/core', {
      params: { locale: 'en', lat, lon, distance: CELL_RADIUS_KM, count: 100 }
    });
    const results = resp.data.data.results || [];
    console.log(`[${lat.toFixed(3)},${lon.toFixed(3)}] → ${results.length}`);
    for (const p of results) {
      const user = p.user;
      if (seenIds.has(user._id)) continue;
      seenIds.add(user._id);
      await saveProfile(user, p.distance_mi, p.s_number, p.content_hash);
    }
  } catch (err) {
    if (err.response?.status === 429) {
      console.warn('Rate limited');
    } else {
      console.error(err.message);
    }
  }
}
async function saveProfile(user, distanceMi, sNumber, contentHash) {
  const safeName = user.name.replace(/[^\w\s-]/g, '_').trim();
  const dir = path.join('../PROFILES', `${safeName}_${user._id}`);
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
  const photoLimit = pLimit(5);
  await Promise.all(
    metadata.photos.map((url, i) => photoLimit(async () => {
      try {
        const res = await fetch(url);
        const buf = await res.buffer();
        const ext = path.extname(url).split('?')[0] || '.jpg';
        fs.writeFileSync(path.join(dir, `photo_${i + 1}${ext}`), buf);
      } catch (error) {
        console.error('Photo download failed', error.message);
      }
    }))
  );
  console.log(`Saved ${user._id}`);
}
(async () => {
  const jobs = cells.map(cell => limit(() => fetchCell(cell)));
  await Promise.all(jobs);
  console.log(`Done: ${seenIds.size} profiles`);
})();
