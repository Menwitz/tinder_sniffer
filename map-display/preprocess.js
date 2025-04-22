// map-display/preprocess.js
// ──────────────────────────────────────────────────────────────────────────────
// This script reads every profile.json under ../PROFILES, uses each profile’s
// distance_km to compute a random offset from the bounding-box center, and
// emits profiles.geojson for Leaflet mapping.
// ──────────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

// 1. Bounding-box constants
const MIN_LAT = 48.80;
const MAX_LAT = 48.92;
const MIN_LON = 2.25;
const MAX_LON = 2.45;

// 2. Compute center
const CENTER_LAT = (MIN_LAT + MAX_LAT) / 2;
const CENTER_LON = (MIN_LON + MAX_LON) / 2;

// 3. Earth radius in km
const R = 6371;

// 4. Helpers
const toRad = deg => deg * Math.PI / 180;
const toDeg = rad => rad * 180 / Math.PI;

// 5. Age calculation
function calcAge(birthDate) {
  const diff = Date.now() - new Date(birthDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

const PROFILES_DIR = path.resolve(__dirname, '../PROFILES');
const features = [];

fs.readdirSync(PROFILES_DIR).forEach(folder => {
  const jsonPath = path.join(PROFILES_DIR, folder, 'profile.json');
  if (!fs.existsSync(jsonPath)) return;
  const p = JSON.parse(fs.readFileSync(jsonPath));

  // Skip if no distance or no photos
  if (typeof p.distance_km !== 'number') return;
  if (!Array.isArray(p.photos) || p.photos.length === 0) return;

  const d = p.distance_km;                // distance in km
  const θ = Math.random() * 2 * Math.PI;  // random bearing

  // Convert center to radians
  const φ1 = toRad(CENTER_LAT);
  const λ1 = toRad(CENTER_LON);

  // Angular distance
  const δ = d / R;

  // Compute destination point
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) +
    Math.cos(φ1) * Math.sin(δ) * Math.cos(θ)
  );
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  );

  const lat = toDeg(φ2);
  const lon = toDeg(λ2);

  features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      userId:  p.userId,
      name:    p.name,
      age:     calcAge(p.birth_date),
      photoUrl: p.photos[0]
    }
  });
});

// 6. Write GeoJSON
const geojson = { type: 'FeatureCollection', features };
fs.writeFileSync('profiles.geojson', JSON.stringify(geojson, null, 2));
console.log(`Generated profiles.geojson with ${features.length} points.`);