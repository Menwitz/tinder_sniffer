// MapView.jsx
import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, DivIcon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export default function MapView() {
  const [profiles, setProfiles] = useState([]);

  useEffect(() => {
    fetch('/profiles.geojson')
      .then(r => r.json())
      .then(gj => setProfiles(gj.features));
  }, []);

  return (
    <MapContainer center={[48.86, 2.33]} zoom={12} style={{ height: '100vh' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {profiles.map(f => {
        const [lon, lat] = f.geometry.coordinates;
        const { name, age, photoUrl } = f.properties;
        const icon = new DivIcon({
          html: `<div style="
                  border:2px solid white;
                  border-radius:50%;
                  overflow:hidden;
                  width:40px;height:40px;
                ">
                  <img src="${photoUrl}" style="width:100%;height:100%;object-fit:cover;" />
                </div>`,
          className: ''
        });
        return (
          <Marker key={f.properties.userId} position={[lat, lon]} icon={icon}>
            <Popup><strong>{name}, {age}</strong></Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
di