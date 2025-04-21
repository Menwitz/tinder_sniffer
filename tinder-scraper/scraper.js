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
//   - Run: node scraper.js
//   - Check: tinder_photos/ directory for saved profiles
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
dotenv.config();
import axios from 'axios';
import pLimit from 'p-limit';
import fs from 'fs';
import path from 'path';
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const TOKENS = process.env.TINDER_TOKENS?.split(',').map(t => t.trim());
if (!TOKENS || !TOKENS.length) throw new Error('Set TINDER_TOKENS in .env');
const PROXIES = process.env.PROXIES?.split(',').map(p => p.trim()) || [];
const MIN_LAT = parseFloat(process.env.MIN_LAT);
const MAX_LAT = parseFloat(process.env.MAX_LAT);
const MIN_LON = parseFloat(process.env.MIN_LON);
const MAX_LON = parseFloat(process.env.MAX_LON);
if ([MIN_LAT, MAX_LAT, MIN_LON, MAX_LON].some(isNaN)) throw new Error('Set MIN_LAT, MAX_LAT, MIN_LON, MAX_LON in .env');
const CELL_RADIUS_KM = parseFloat(process.env.CELL_RADIUS_KM) || 10;
const CONCURRENCY_PER_TOKEN = parseInt(process.env.CONCURRENCY_PER_TOKEN) || 20;
const TARGET_PROFILES = parseInt(process.env.TARGET_PROFILES) || 500;
const TOTAL_CONCURRENCY = TOKENS.length * CONCURRENCY_PER_TOKEN;
const limit = pLimit(TOTAL_CONCURRENCY);
const seenIds = new Set();
const LAT_STEP = CELL_RADIUS_KM / 111;
const MID_LAT = (MIN_LAT + MAX_LAT) / 2;
const LON_STEP = CELL_RADIUS_KM / (111 * Math.cos(MID_LAT * Math.PI / 180));
const cells = [];
for (let lat = MIN_LAT; lat <= MAX_LAT; lat += LAT_STEP) {
  for (let lon = MIN_LON; lon <= MAX_LON; lon += LON_STEP) {
    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    cells.push({ lat, lon, key });
  }
}
const cellState = {};
cells.forEach(c => cellState[c.key] = { sNumber: null, coldCount: 0 });
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
async function fetchCell(cell) {
  if (seenIds.size >= TARGET_PROFILES) return false;
  const token = TOKENS.shift(); TOKENS.push(token);
  const proxyUrl = PROXIES.length ? PROXIES.shift() : null;
  if (proxyUrl) PROXIES.push(proxyUrl);
  const params = { locale: 'en', lat: cell.lat, lon: cell.lon, distance: CELL_RADIUS_KM, count: 100 };
  if (cellState[cell.key].sNumber) params.s_number = cellState[cell.key].sNumber;
  try {
    const client = axios.create({ timeout:15000, headers:{ 'X-Auth-Token':token,'accept-language':'en','User-Agent':'Mozilla/5.0 Tinder/WEB' }, proxy: proxyUrl? new URL(proxyUrl): false });
    const resp = await client.get('https://api.gotinder.com/v2/recs/core', { params });
    const results = resp.data.data.results || [];
    cellState[cell.key].sNumber = resp.data.data.s_number || cellState[cell.key].sNumber;
    const newProfiles = results.filter(p => !seenIds.has(p.user._id));
    if (!newProfiles.length) { cellState[cell.key].coldCount++; return false; }
    cellState[cell.key].coldCount = 0;
    for (const p of newProfiles) {
      if (seenIds.size >= TARGET_PROFILES) break;
      const user = p.user; seenIds.add(user._id);
      await saveProfile(user, p.distance_mi, p.s_number, p.content_hash);
    }
    return true;
  } catch (err) {
    if (err.response?.status === 429) process.stdout.write('429 ');
    return false;
  }
}
async function saveProfile(user, distanceMi, sNumber, contentHash) {
  const safeName = user.name.replace(/[^\w\s-]/g,'_').trim();
  const dir = path.join('tinder_photos',`${safeName}_${user._id}`); ensureDir(dir);
  const metadata = { userId:user._id,name:user.name,birth_date:user.birth_date,bio:user.bio,gender:user.gender,jobs:user.jobs,schools:user.schools,city:user.city?.name||null,distance_mi:distanceMi,distance_km:distanceMi?Math.round(distanceMi*1.60934*10)/10:null,s_number:sNumber,content_hash:contentHash,photos:user.photos.map(img=>img.url),timestamp:new Date().toISOString() };
  fs.writeFileSync(path.join(dir,'profile.json'),JSON.stringify(metadata,null,2));
  await Promise.all(metadata.photos.map((url,i)=>limit(async()=>{ try{
    const res = await fetch(url); const arrayBuf = await res.arrayBuffer(); const buf = Buffer.from(arrayBuf);
    const ext = path.extname(url).split('?')[0]||'.jpg'; fs.writeFileSync(path.join(dir,`photo_${i+1}${ext}`),buf);
  }catch{} })), {concurrency:5});
  console.log(`Saved ${user._id} (${seenIds.size}/${TARGET_PROFILES})`);
  if (seenIds.size>=TARGET_PROFILES) { console.log('Target reached'); process.exit(0); }
}
(async()=>{
  console.log(`Grid: ${cells.length} cells`);
  while(seenIds.size<TARGET_PROFILES && Object.keys(cellState).some(k=>cellState[k].coldCount<3)){
    await Promise.all(cells.map(cell=>limit(()=>fetchCell(cell))));
  }
  console.log(`Done: ${seenIds.size} profiles`);
})();
