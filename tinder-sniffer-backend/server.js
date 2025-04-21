import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import mkdirp from "mkdirp";
import path from "path";

const app = express();
const PORT = 5050;

// 🧱 CORS Middleware for https://tinder.com
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://tinder.com");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: "10mb" }));

app.post("/save", async (req, res) => {
  const {
    userId,
    name,
    photos,
    birth_date,
    bio,
    gender,
    jobs,
    schools,
    city,
    distance,
    s_number,
    content_hash
  } = req.body;

  if (!userId || !photos || photos.length === 0) {
    return res.status(400).send("Invalid profile payload.");
  }

  const safeName = name.replace(/[^\w\s-]/g, "_").trim();
  const dir = path.join("../PROFILES/", `${safeName}_${userId}`);
  mkdirp.sync(dir);

  console.log(`\n🧬 Saving profile: ${name} (${userId})`);

  // 📥 Download Photos
  for (let i = 0; i < photos.length; i++) {
    try {
      const photoURL = photos[i];
      const response = await fetch(photoURL);
      const buffer = await response.buffer();
      const ext = path.extname(photoURL).split("?")[0] || ".jpg";
      const filename = path.join(dir, `photo_${i + 1}${ext}`);
      fs.writeFileSync(filename, buffer);
      console.log(`📸 Saved: ${filename}`);
    } catch (err) {
      console.error(`❌ Failed to download image ${i + 1}`, err);
    }
  }

  // 🎂 Age Calculation
  let age = null;
  try {
    if (birth_date) {
      const birth = new Date(birth_date);
      const now = new Date();
      age = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
        age -= 1;
      }
    }
  } catch (e) {
    console.warn("Could not calculate age:", e);
  }

  // 🧠 Build enriched metadata object
  const metadata = {
    userId,
    name,
    age,
    birth_date,
    bio,
    gender,
    jobs,
    schools,
    city,
    distance_mi: distance,
    distance_km: distance ? Math.round(distance * 1.60934 * 10) / 10 : null,
    s_number,
    content_hash,
    photoCount: photos.length,
    timestamp: new Date().toISOString()
  };

  const metadataPath = path.join(dir, "profile.json");
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`🧠 Saved metadata: ${metadataPath}`);

  res.send("✅ Profile saved with enriched metadata");
});

app.listen(PORT, () => {
  console.log(`🚀 Tinder Sniffer backend running at http://localhost:${PORT}`);
});
