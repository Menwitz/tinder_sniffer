// map-display/preprocess.js
// Reads every profile.json under ../PROFILES
// Generates low-res thumbnails into ./thumbnails and emits profiles.geojson

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
  const totalProfiles = folders.length;
  let generated = 0;
  let skippedJson = 0, skippedPhoto = 0;
  const features = [];
  const thumbPromises = [];

  console.log(`Starting preprocess: ${totalProfiles} profile folders found.`);

  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i];
    console.log(`[${i+1}/${totalProfiles}] Processing folder: ${folder}`);
    try {
      const jsonPath = path.join(PROFILES_DIR, folder, 'profile.json');
      if (!fs.existsSync(jsonPath)) {
        console.warn(`  Skipped: no profile.json`);
        skippedJson++;
        continue;
      }
      const p = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

      // Find any photo_* file in the folder (any extension)
      const folderFiles = fs.readdirSync(path.join(PROFILES_DIR, folder));
      const photoFile = folderFiles.find(f => /^photo_\d+\.[^.]+$/i.test(f));
      if (!photoFile) {
        console.warn(`  Skipped: no photo file found in ${folder}`);
        skippedPhoto++;
        continue;
      }
      const photoSrc = path.join(PROFILES_DIR, folder, photoFile);
      console.log(`  Found photo: ${photoFile}`);

      // Generate thumbnail
      const thumbName = `${folder}.jpg`;
      const thumbPath = path.join(THUMB_DIR, thumbName);
      console.log(`  Generating thumbnail: thumbnails/${thumbName}`);
      thumbPromises.push(
        sharp(photoSrc)
          .resize(80, 80)
          .jpeg({ quality: 70 })
          .toFile(thumbPath)
          .catch(err => console.error(`  Error creating thumbnail for ${folder}:`, err))
      );

      // Compute random geo-offset
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

      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          userId:      p.userId,
          name:        p.name,
          age:         calcAge(p.birth_date),
          photoUrl:    `thumbnails/${thumbName}`,
          distance_km: d
        }
      });
      generated++;
    } catch (err) {
      console.error(`  Unexpected error processing ${folder}:`, err);
    }
  }

  console.log('Waiting for thumbnail generation to complete...');
  await Promise.all(thumbPromises);

  const geojson = { type: 'FeatureCollection', features };
  fs.writeFileSync('profiles.geojson', JSON.stringify(geojson, null, 2), 'utf-8');

  console.log('Preprocess complete.');
  console.log(`  Total folders:           ${totalProfiles}`);
  console.log(`  Thumbnails generated:    ${generated}`);
  console.log(`  Skipped (no JSON):       ${skippedJson}`);
  console.log(`  Skipped (no photo):      ${skippedPhoto}`);
})();