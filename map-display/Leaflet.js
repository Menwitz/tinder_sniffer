<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>ScraperV3 Map</title>
  <link
    rel="stylesheet"
    href="https://unpkg.com/leaflet/dist/leaflet.css"
  />
  <style>
    #map { height: 100vh; }
    .profile-icon img {
      border-radius: 50%;
      width: 40px;
      height: 40px;
      object-fit: cover;
      border: 2px solid white;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
  <script>
    // 1. Initialize map
    const map = L.map('map').setView([48.86, 2.33], 12);

    // 2. Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // 3. Load GeoJSON
    fetch('profiles.geojson')
      .then(res => res.json())
      .then(data => {
        data.features.forEach(f => {
          const { coordinates } = f.geometry;
          const { name, age, photoUrl } = f.properties;

          // 4. Create custom icon
          const iconHtml = `<div class="profile-icon">
                              <img src="${photoUrl}" alt="${name}">
                            </div>`;
          const icon = L.divIcon({
            html: iconHtml,
            className: '',    // remove default
            iconSize: [40, 40]
          });

          // 5. Marker + Popup
          L.marker([coordinates[1], coordinates[0]], { icon })
            .addTo(map)
            .bindPopup(`<strong>${name}, ${age}</strong>`);
        });
      });
  </script>
</body>
</html>
