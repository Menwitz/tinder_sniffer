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
    new winston.transports.File({ filename: 'logs/scraperV3.log', maxsize: 10485760, maxFiles: 5 })
  ]
});

import axios from 'axios';
import pLimit from 'p-limit';
import fs from 'fs';
import path from 'path';
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

// scraper V3 with photo downloads, pass throttling, and backoff on 429
const TOKENS = process.env.TINDER_TOKENS?.split(',').map(t => t.trim());
if (!TOKENS?.length) throw new Error('Set TINDER_TOKENS in .env');
const PROXIES = process.env.PROXIES?.split(',').map(p => p.trim()) || [];
const MIN_LAT = parseFloat(process.env.MIN_LAT);
const MAX_LAT = parseFloat(process.env.MAX_LAT);
const MIN_LON = parseFloat(process.env.MIN_LON);
const MAX_LON = parseFloat(process.env.MAX_LON);
if ([MIN_LAT, MAX_LAT, MIN_LON, MAX_LON].some(isNaN)) throw new Error('Set MIN_LAT,MAX_LAT,MIN_LON,MAX_LON');
const CELL_RADIUS_KM = parseFloat(process.env.CELL_RADIUS_KM) || 10;
const CONCURRENCY_PER_TOKEN = parseInt(process.env.CONCURRENCY_PER_TOKEN) || 20;
const SWEEP_PAUSE_MS = parseInt(process.env.SWEEP_PAUSE_MS) || 1000;
const PASS_DELAY_MS = parseInt(process.env.PASS_DELAY_MS) || 200;
const BACKOFF_MS = parseInt(process.env.PASS_BACKOFF_MS) || 5000;
const LIMIT = CONCURRENCY_PER_TOKEN * TOKENS.length;
const limit = pLimit(LIMIT);

const seen = new Set();
const state = {};
const tokenBackoffUntil = new Array(TOKENS.length).fill(0);

// compute grid step
const LAT_STEP = CELL_RADIUS_KM / 111;
const MID_LAT_GLOBAL = (MIN_LAT + MAX_LAT) / 2;
const LON_STEP_GLOBAL = CELL_RADIUS_KM / (111 * Math.cos(MID_LAT_GLOBAL * Math.PI / 180));

// split bounding box among tokens into 3x3 grids
const tokenCount = TOKENS.length;
const lonSpan = MAX_LON - MIN_LON;
const subWidth = lonSpan / tokenCount;
const cells = [];
for (let i = 0; i < tokenCount; i++) {
  const tokenMinLon = MIN_LON + i * subWidth;
  const tokenMaxLon = tokenMinLon + subWidth;
  const centerLon = (tokenMinLon + tokenMaxLon) / 2;
  const centerLat = MID_LAT_GLOBAL;
  const LON_STEP_LOCAL = CELL_RADIUS_KM / (111 * Math.cos(centerLat * Math.PI / 180));
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const lat = centerLat + dy * LAT_STEP;
      const lon = centerLon + dx * LON_STEP_LOCAL;
      const key = `${i}-${dy}-${dx}`;
      cells.push({ tokenIndex: i, lat, lon, key });
      state[key] = { s: null, cold: 0 };
    }
  }
}

const USER_AGENTS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Tinder/WEB',
  'Mozilla/5.0 (Linux; Android 10; SM-G973F) Tinder/WEB',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Tinder/WEB'
];

function shuffle(array) { for (let i = array.length; i; i--) { const j = Math.floor(Math.random() * i); [array[i-1], array[j]] = [array[j], array[i-1]]; } return array; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

async function passProfile(userId, token, tokenIdx, sNumber, contentHash) {
  const now = Date.now();
  if (now < tokenBackoffUntil[tokenIdx]) return;
  try {
    await axios.get(`https://api.gotinder.com/pass/${userId}`, {
      headers: { 'X-Auth-Token': token },
      params: { locale: 'en', s_number: sNumber, content_hash: contentHash }
    });
    logger.info({ event: 'pass', userId });
  } catch (e) {
    if (e.response?.status === 429) {
      tokenBackoffUntil[tokenIdx] = Date.now() + BACKOFF_MS;
      logger.warn({ event: 'pass_backoff', userId, tokenIdx, backoffUntil: tokenBackoffUntil[tokenIdx] });
    } else {
      logger.warn({ event: 'pass_error', userId, message: e.message });
    }
  }
}

async function fetchCell(cell) {
  const { tokenIndex, lat: cellLat, lon: cellLon, key } = cell;
  const token = TOKENS[tokenIndex];
  const proxy = PROXIES[tokenIndex % PROXIES.length] || null;
  if (Date.now() < tokenBackoffUntil[tokenIndex]) return;

  const jitterLat = cellLat + (Math.random()*2-1)*LAT_STEP;
  const jitterLon = cellLon + (Math.random()*2-1)*LON_STEP_GLOBAL;
  const params = { locale:'en', lat:jitterLat, lon:jitterLon, distance:CELL_RADIUS_KM, count:100 };
  if (state[key].s) params.s_number = state[key].s;

  logger.info({ event:'fetch_start', tokenIndex, cell:key, lat:jitterLat, lon:jitterLon });
  const start = Date.now();
  try {
    const ua = USER_AGENTS[Math.floor(Math.random()*USER_AGENTS.length)];
    const client = axios.create({ timeout:15000, headers:{ 'X-Auth-Token':token, 'User-Agent':ua }, proxy: proxy? new URL(proxy):false });
    const res = await client.get('https://api.gotinder.com/v2/recs/core', { params });
    const data = res.data.data;
    state[key].s = data.s_number || state[key].s;
    const newProfiles = (data.results||[]).filter(p=>!seen.has(p.user._id));
    const duration = Date.now() - start;
    logger.info({ event:'fetch_result', tokenIndex, cell:key, count:newProfiles.length, duration });
    if (!newProfiles.length) { state[key].cold++; return; }
    state[key].cold=0;
    for (const p of newProfiles) {
      seen.add(p.user._id);
      await saveProfile(p.user, p.distance_mi, p.s_number, p.content_hash, tokenIndex);
    }
  } catch (e) {
    if (e.response?.status===429) {
      tokenBackoffUntil[tokenIndex]=Date.now()+BACKOFF_MS;
      logger.warn({ event:'rate_backoff', tokenIndex, backoffUntil:tokenBackoffUntil[tokenIndex] });
    } else {
      logger.error({ event:'fetch_error', tokenIndex, cell:key, message:e.message });
    }
  }
}

async function saveProfile(user, distanceMi, sNumber, contentHash, tokenIndex) {
  logger.info({ event:'profile_save_start', userId:user._id });
  const safe = user.name.replace(/[^\w\s-]/g,'_').trim();
  const dir = path.join('../PROFILES/',`${safe}_${user._id}`);
  ensureDir(dir);
  const metadata = { userId:user._id,name:user.name,birth_date:user.birth_date,bio:user.bio,gender:user.gender,jobs:user.jobs,schools:user.schools,city:user.city?.name||null,distance_mi:distanceMi,distance_km:distanceMi?Math.round(distanceMi*1.60934*10)/10:null,s_number:sNumber,content_hash:contentHash,photos:user.photos.map(i=>i.url),timestamp:new Date().toISOString() };
  fs.writeFileSync(path.join(dir,'profile.json'),JSON.stringify(metadata,null,2));

  // download photos
  await Promise.all(
    metadata.photos.map((url,i) => limit(async () => {
      try {
        const imgRes = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
        const buf = Buffer.from(imgRes.data);
        const ext = path.extname(url).split('?')[0] || '.jpg';
        fs.writeFileSync(path.join(dir, `photo_${i+1}${ext}`), buf);
        logger.info({ event:'photo_saved', userId:user._id, index:i+1 });
      } catch (e) {
        logger.warn({ event:'photo_download_failed', userId:user._id, url, message:e.message });
      }
    }))
  );

  logger.info({ event:'profile_save_complete', userId:user._id });
  await sleep(PASS_DELAY_MS);
  await passProfile(user._id, TOKENS[tokenIndex], tokenIndex, sNumber, contentHash);
}

function gracefulShutdown(){ logger.info({ event:'done', totalProfiles:seen.size }); process.exit(0); }
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

(async()=>{
  logger.info({ event:'start', tokenCount, cells:cells.length });
  while(true){
    shuffle(cells);
    const active = cells.filter(c=>state[c.key].cold<3 && Date.now()>=tokenBackoffUntil[c.tokenIndex]);
    logger.info({ event:'sweep_start', activeCount:active.length });
    await Promise.all(active.map(cell=>limit(()=>fetchCell(cell))));
    logger.info({ event:'sweep_complete', totalProfiles:seen.size });
    logger.info({ event:'sweep_pause', duration:SWEEP_PAUSE_MS });
    await sleep(SWEEP_PAUSE_MS);
  }
})();
