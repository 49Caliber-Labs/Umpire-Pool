# Youth Sports Umpire Gear NFL Pool Fundraiser

An open-source, white-label NFL Pick'em Football Pool platform built for **Little Leagues, youth sports associations, and non-profit officiating organizations** to raise dedicated funds for umpire and referee protective gear (chest protectors, masks, shin guards, and training equipment).

---

## Key Features

- **5-Step League Setup Wizard (Opens Automatically on First Launch)**:
  - Customize your league name, youth sports association, entry fee, and umpire equipment fundraising split.
  - Automatically sets the Pool Admin as Contender #1 on the roster.
  - **Midseason Launch Protection**: Automatically queries the live ESPN NFL calendar on launch; if the NFL season is already underway (`Week > 1`), prompts the Pool Admin for confirmation before launching into the active week.
- **Add Contenders at Any Point**:
  - Add new contenders mid-week or mid-season directly from **Admin Hub → Roster Management ("+ Add Contender")** or via the **Setup Wizard** without wiping existing contenders' active picks, dispatches, fines, chat history, or compiled season standings.
- **Power-Outage & Server-Restart Resilience**:
  - Atomic disk persistence (`data/pool-storage.json`) paired with an automatic rolling backup (`data/pool-storage.bak.json`).
  - Automatic recovery from `pool-storage.bak.json` if a power outage occurs mid-write.
  - Once configured (`isConfigured: true`), server restarts never overwrite the active week, game slate, or contender picks.
- **Zero-Friction Contender Picking**:
  - Straight-up weekly NFL game picks (1 point per win) with a Monday Night Football combined-points tiebreaker.
  - Optional **Elvis (Vegas Favorites Pacer)** automated contender that picks the point-spread favorites each week.
- **Automated Weekly Dispatches & Exports**:
  - Generates Friday Night Wire, Sunday Night Recap, and Tuesday Final dispatches with one-click **PDF** and **Word (.docx)** exports.
- **1986 Two-Edition Classic & $1 Umpire Fine Jar**:
  - Includes the short 1986 volunteer umpire origin story and an optional $1 Umpire Fine Jar for good-natured locker room banter that goes 100% toward the umpire gear fund.

---

## Quick Start

### Prerequisites
- **Node.js** 20+ (or **Bun** 1.2+)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables (Optional)
Copy `.env.example` to `.env.local` if you want to enable optional Gemini AI pick-sheet OCR or custom port configuration:
```bash
cp .env.example .env.local
```
- `GEMINI_API_KEY` *(optional)*: Enables AI OCR parsing of photographed paper pick sheets (`POST /api/picks/parse-image`). All core pool operations, live ESPN score syncing, and weekly dispatches work without an API key.
- `PORT` *(optional)*: Defaults to `3000`.

### 3. Start the Application
```bash
npm run dev
```
Open `http://localhost:3000` in your browser. On first launch, the **Umpire Fundraiser Pool Setup Wizard** opens automatically so you can configure your league and launch your roster.

---

## Production Build & Backup

- **Build Frontend Assets**:
  ```bash
  npm run build
  ```
- **Export / Restore JSON Backups**:
  Use **Admin Hub → System Operations** (or `GET /api/admin/export-backup` and `POST /api/admin/import-backup`) at any time to download or restore a full snapshot of your pool state.

---

## License
Released under the **MIT License**. Built to support volunteer youth sports umpires and referees everywhere.
