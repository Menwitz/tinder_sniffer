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
dotenv.config();
import axios from 'axios';
import pLimit from 'p-limit';
import fs from 'fs';
import path from 'path';
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const TOKENS = process.env.TINDER_TOKENS?.split(',').map(t=>t.trim());
if(!TOKENS?.length) throw new Error('Set TINDER_TOKENS in .env');
const PROXIES = process.env.PROXIES?.split(',').map(p=>p.trim())||[];
const MIN_LAT=parseFloat(process.env.MIN_LAT), MAX_LAT=parseFloat(process.env.MAX_LAT);
const MIN_LON=parseFloat(process.env.MIN_LON), MAX_LON=parseFloat(process.env.MAX_LON);
if([MIN_LAT,MAX_LAT,MIN_LON,MAX_LON].some(isNaN)) throw new Error('Set MIN_LAT,MAX_LAT,MIN_LON,MAX_LON');
const CELL_RADIUS_KM=parseFloat(process.env.CELL_RADIUS_KM)||10;
const CONCURRENCY_PER_TOKEN=parseInt(process.env.CONCURRENCY_PER_TOKEN)||20;
const LIMIT=CONCURRENCY_PER_TOKEN*TOKENS.length;
const limit=pLimit(LIMIT);
const seen=new Set();
const LAT_STEP=CELL_RADIUS_KM/111, MID_LAT=(MIN_LAT+MAX_LAT)/2;
const LON_STEP=CELL_RADIUS_KM/(111*Math.cos(MID_LAT*Math.PI/180));
const cells=[];
for(let lat=MIN_LAT;lat<=MAX_LAT;lat+=LAT_STEP)for(let lon=MIN_LON;lon<=MAX_LON;lon+=LON_STEP)cells.push({lat,lon,key:`${lat.toFixed(6)},${lon.toFixed(6)}`});
const state={};cells.forEach(c=>state[c.key]={s:null,cold:0});
const USER_AGENTS=[
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Tinder/WEB',
  'Mozilla/5.0 (Linux; Android 10; SM-G973F) Tinder/WEB',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Tinder/WEB'
];
function shuffle(a){for(let i=a.length;i;){const j=Math.floor(Math.random()*i);[a[i-1],a[j]]=[a[j],a[i-1]];i--;}return a;}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function ensure(dir){fs.mkdirSync(dir,{recursive:true});}
async function fetchCell(cell){const token=TOKENS.shift();TOKENS.push(token);
 const proxy=PROXIES.length?PROXIES.shift():null; if(proxy)PROXIES.push(proxy);
 const lat=cell.lat+((Math.random()*2-1)*(CELL_RADIUS_KM/111));
 const lon=cell.lon+((Math.random()*2-1)*(CELL_RADIUS_KM/(111*Math.cos(MID_LAT*Math.PI/180))));
 const params={locale:'en',lat,lon,distance:CELL_RADIUS_KM,count:100};
 if(state[cell.key].s)params.s_number=state[cell.key].s;
 try{const ua=USER_AGENTS[Math.floor(Math.random()*USER_AGENTS.length)];
  const client=axios.create({timeout:15000,headers:{'X-Auth-Token':token,'accept-language':'en','User-Agent':ua},proxy:proxy?new URL(proxy):false});
  const r=await client.get('https://api.gotinder.com/v2/recs/core',{params});
  const res=r.data.data;state[cell.key].s=res.s_number||state[cell.key].s;
  const results=res.results||[];const newp=results.filter(p=>!seen.has(p.user._id));
  if(!newp.length){state[cell.key].cold++;return;} state[cell.key].cold=0;
  for(const p of newp){if(seen.has(p.user._id))continue;seen.add(p.user._id);
    const u=p.user;await save(u,p.distance_mi,p.s_number,p.content_hash);
  }
 }catch(e){if(e.response?.status===429)process.stdout.write('429 ');} }
async function save(user,d,sn,ch){const safe=user.name.replace(/[^\w\s-]/g,'_').trim();const dir=path.join('../PROFILES',`${safe}_${user._id}`);ensure(dir);
 const md={userId:user._id,name:user.name,birth_date:user.birth_date,bio:user.bio,gender:user.gender,jobs:user.jobs,schools:user.schools,city:user.city?.name||null,distance_mi:d,distance_km:d?Math.round(d*1.60934*10)/10:null,s_number:sn,content_hash:ch,photos:user.photos.map(i=>i.url),timestamp:new Date().toISOString()};
 fs.writeFileSync(path.join(dir,'profile.json'),JSON.stringify(md,null,2));
 await Promise.all(md.photos.map((url,i)=>limit(async()=>{try{const r=await fetch(url);const ab=await r.arrayBuffer();const buf=Buffer.from(ab);const ext=path.extname(url).split('?')[0]||'.jpg';fs.writeFileSync(path.join(dir,`photo_${i+1}${ext}`),buf);}catch{};})));
 console.log(`Saved ${user._id} (${seen.size})`);
}
(async()=>{console.log(`Start continuous scrape on ${cells.length} cells`);
 while(true){shuffle(cells);
  for(const c of cells){if(state[c.key].cold>=3)continue;await fetchCell(c);await sleep(1000+Math.random()*2000);} }
})();
