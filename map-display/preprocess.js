// map-display/preprocess.js
// Reads every profile.json under ../PROFILES
// Generates thumbnails for all local photos into ./thumbnails
// Emits profiles.geojson with full profile info and thumbnail URLs

const fs = require('fs');
const path = require('path');
const sharp = require('sharp'); // npm install sharp

// Bounding-box constants
const MIN_LAT = 48.80;
const MAX_LAT = 48.92;
const MIN_LON = 2.25;
const MAX_LON = 2.45;
const CENTER_LAT = (MIN_LAT + MAX_LAT) / 2;
const CENTER_LON = (MIN_LON + MAX_LON) / 2;
const R = 6371; // Earth radius in km

const PROFILES_DIR = path.resolve(__dirname, '../PROFILES');
const THUMB_DIR = path.resolve(__dirname, 'thumbnails');
if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR);

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }
function calcAge(birthDate) {
  const diffMs = Date.now() - new Date(birthDate).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25));
}

(async () => {
  const folders = fs.readdirSync(PROFILES_DIR);
  console.log(`Found ${folders.length} profile folders.`);

  const features = [];
  const thumbTasks = [];

  folders.forEach((folder, idx) => {
    console.log(`Processing [${idx+1}/${folders.length}]: ${folder}`);
    const profileDir = path.join(PROFILES_DIR, folder);
    const jsonPath = path.join(profileDir, 'profile.json');
    if (!fs.existsSync(jsonPath)) {
      console.warn(`  skip: missing profile.json`);
      return;
    }
    const p = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

    // Find all photo files (any extension)
    const files = fs.readdirSync(profileDir);
    const photoFiles = files.filter(f => f.toLowerCase().startsWith('photo_'));
      
      if (photoFiles.length === 0) {
        console.warn(`  skip: no photo_ files`);
        return;
      }(f => /^photo_\d+\.[^.]+$/i.test(f));
    if (photoFiles.length === 0) {
      console.warn(`  skip: no photo_* files`);
      return;
    }

    // Generate thumbnails for each photo
    const thumbUrls = [];
    photoFiles.forEach((file, i) => {
      const src = path.join(profileDir, file);
      const thumbName = `${folder}_${i}.jpg`;
      const dest = path.join(THUMB_DIR, thumbName);
      thumbUrls.push(`thumbnails/${thumbName}`);
      thumbTasks.push(
        sharp(src)
          .resize(100, 100)
          .jpeg({ quality: 60 })
          .toFile(dest)
          .catch(err => console.error(`  thumb error ${file}:`, err))
      );
      console.log(`  scheduled thumbnail for ${file}`);
    });

    // Compute random offset
    const d = typeof p.distance_km === 'number' ? p.distance_km : 0;
    const theta = Math.random() * 2 * Math.PI;
    const phi1 = toRad(CENTER_LAT), lambda1 = toRad(CENTER_LON);
    const delta = d / R;
    const phi2 = Math.asin(
      Math.sin(phi1) * Math.cos(delta) +
      Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
    );
    const lambda2 = lambda1 + Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );
    const lat = toDeg(phi2), lon = toDeg(lambda2);

    // Attach full profile data
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        userId:   p.userId,
        name:     p.name,
        age:      calcAge(p.birth_date),
        bio:      p.bio || '',
        jobs:     (p.jobs || []).map(j => j.title?.name || '').filter(Boolean),
        schools:  (p.schools || []).map(s => s.name).filter(Boolean),
        photos:   thumbUrls,
        distance_km: d
      }
    });
  });

  console.log('Generating all thumbnails...');
  const results = await Promise.allSettled(thumbTasks);
  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  console.log(`Thumbnails done: ${succeeded} succeeded, ${failed} failed.`);

  const geojson = { type: 'FeatureCollection', features };
  fs.writeFileSync('profiles.geojson', JSON.stringify(geojson, null, 2), 'utf-8');
  console.log(`Wrote profiles.geojson with ${features.length} features.`);
})();