import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import pLimit from 'p-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES module: derive __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Base path where profiles were saved
const PROFILES_PATH = process.env.PROFILES_PATH || path.join(__dirname, '../PRO');
// Concurrency limit
const CONCURRENCY = parseInt(process.env.DOWNLOAD_CONCURRENCY, 10) || 10;
const limit = pLimit(CONCURRENCY);

function listProfileDirs(basePath) {
  if (!fs.existsSync(basePath)) return [];
  return fs.readdirSync(basePath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => path.join(basePath, dirent.name));
}

function loadMetadata(dir) {
  const file = path.join(dir, 'profile.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.warn(`Failed to parse ${file}: ${err.message}`);
    return null;
  }
}

async function downloadImage(url, dest) {
  if (fs.existsSync(dest)) return;
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
    fs.writeFileSync(dest, Buffer.from(res.data));
    console.log(`Saved: ${dest}`);
  } catch (err) {
    console.warn(`Error downloading ${url}: ${err.message}`);
  }
}

(async () => {
  console.log(`Scanning ${PROFILES_PATH}`);
  const dirs = listProfileDirs(PROFILES_PATH);
  console.log(`Found ${dirs.length} profiles.`);

  for (const dir of dirs) {
    const meta = loadMetadata(dir);
    if (!meta || !Array.isArray(meta.photos)) continue;

    const tasks = meta.photos.map((url, idx) => limit(async () => {
      const ext = path.extname(new URL(url).pathname) || '.jpg';
      const out = path.join(dir, `photo_${idx+1}${ext}`);
      await downloadImage(url, out);
    }));

    await Promise.all(tasks);
  }

  console.log('Done');
})();