# 🔍 **Tinder Sniffer: Engineering Overview**

## 🧠 What It Is

**Tinder Sniffer** is a browser-based intelligence-gathering system designed to:

- Intercept Tinder API responses directly from the frontend
- Extract full user profile metadata and high-resolution photos
- Save all data locally in an organized folder structure
- Generate screenshots of the profile in the actual Tinder UI (for proof-of-capture)

It operates as a **Chrome Extension + Node.js backend pair**, forming a pipeline from in-browser activity → structured local archive.

---

## 🎯 What It’s Made For

The system was designed for:
- **Scraping Tinder user profile data** during regular app usage
- **Archiving visual proof** of what users actually look like on the UI
- **Enabling search, analysis, and classification** of Tinder users at scale
- Serving as a backend for broader data intelligence pipelines (facial recognition, filtering, behavior tracking, etc.)

---

## 🧱 Architecture Breakdown

### 1. **Chrome Extension (`tinder-sniffer/`)**

> Intercepts network traffic and injects JavaScript into Tinder's live frontend.

**Key Files:**
- `manifest.json` – Declares permissions, match patterns, and scripts
- `inject.js` – Injects scripts into Tinder’s JS context
- `interceptor.js` – Hooks into the `fetch()` API to capture Tinder API responses and trigger data/screenshot uploads
- `html2canvas.min.js` – Library used to render the DOM to an image

**Workflow:**
- Runs only on `https://tinder.com`
- Overrides `fetch()` to watch for `/v2/recs/core` (Tinder's recommendations endpoint)
- Extracts:
  - `user._id`, `name`, `birth_date`, `bio`, `gender`, `photos[]`, `distance`, `s_number`, `content_hash`, `jobs`, `schools`, `city`
- Sends profile data to local server via `POST /save`
- Takes DOM screenshots with `html2canvas` and sends them via `POST /proof`

---

### 2. **Node.js Backend (`tinder-sniffer-backend/`)**

> Listens for incoming data and saves it to disk.

**Key File:**
- `server.js`

**Responsibilities:**
- Accept JSON metadata from the extension (`/save`)
  - Calculate age
  - Convert miles → km
  - Store structured `profile.json`
- Accept image screenshots from the extension (`/proof`)
  - Match screenshot to correct profile folder
- Download all image URLs and save them to:
  ```
  tinder_photos/<name>_<user_id>/
    ├── photo_1.jpg
    ├── photo_2.jpg
    └── profile.json
    └── screenshot.png
  ```

---

## 🛠️ Technologies Used

| Component        | Tech Used                      |
|------------------|-------------------------------|
| Browser injection | Chrome Extensions + JS         |
| Network intercept | `fetch` override inside JS     |
| Screenshot capture | `html2canvas` library         |
| Backend server   | Node.js + Express               |
| File I/O         | `fs`, `mkdirp`, `multer`        |
| Image download   | `node-fetch`                   |

---

## 📦 What It Captures Per Profile

| Data                     | Type        | Source               |
|--------------------------|-------------|----------------------|
| ID, name, gender         | string/int  | API response         |
| Birthdate → age          | ISO → int   | Parsed in backend    |
| Bio                      | string      | API response         |
| Photos[]                 | array of URLs | API response       |
| Screenshot               | image       | html2canvas()        |
| Metadata summary         | JSON        | Stored in `profile.json` |
| Distance                 | mi + km     | Calculated backend   |
| Tinder score fingerprint| `s_number`  | API response         |
| Profile hash            | `content_hash` | API response     |
| Timestamp                | ISO string  | Date of capture      |

---

## 🧠 How It Works (Step-by-Step)

1. User visits `https://tinder.com`
2. Chrome extension is injected
3. JS overrides `fetch()` to listen for `/v2/recs/core`
4. When a new recommendation loads:
   - Metadata is extracted
   - Screenshot is taken of the current visible card
   - Both are sent to the backend
5. Backend:
   - Saves images
   - Saves screenshot
   - Builds enriched metadata file

---

## 🧰 How You Can Improve It

As a new engineer, you can work on:

### 📊 Data Layer
- Store profiles in SQLite/MongoDB
- Add search/filter by age, city, keywords
- Build dashboard to browse stored profiles

### 📁 Archival
- Zip each profile folder after saving
- Sync to cloud storage (S3, GDrive)

### 🧠 Enrichment
- Face detection
- Emotion detection
- Text classification on bios

### 🌐 Frontend
- Web dashboard to view and tag profiles
- Markdown generator for each profile

### 🔐 Security
- Add encryption to saved profiles
- Authenticate uploads from the extension

---

## 🧩 Summary

**Tinder Sniffer** is:
- A tactical intelligence tool
- A browser-native passive sniffer
- A structured archiver of Tinder profile data
- A foundation for rich behavioral, visual, and demographic analysis