## Monthly IT & Retail Support Issue Analysis (Local App)

Simple local web app to upload exported WhatsApp support-group chats, analyze issue types, track daily message counts + showroom network disconnections, preview dashboards, and export a styled monthly Excel report **per region**.

### One-time prerequisite (important)

Cursor ships its own `node.exe` that **does not include npm**. To run this project, install **Node.js LTS** (which includes `npm` and `npx`) from the official site, then reopen Cursor/your terminal.

- Verify:
  - `node --version`
  - `npm --version`

### Project structure

- `frontend/`: React + Vite UI
- `backend/`: Express API, WhatsApp parser, Excel export (styled), chart image embedding

### Run locally

In one terminal:

```bash
cd backend
npm install
npm run dev
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Then open the URL printed by the frontend (typically `http://localhost:5173`).

### Backend API

- `POST /api/upload` — multipart upload `.txt` or `.zip` (multiple files). Each file assigned a region.
- `GET /api/analysis` — get current analysis for all regions
- `PUT /api/analysis/:region` — overwrite a region’s edited analysis
- `GET /api/export-excel` — downloads `Monthly_Analysis.xlsx` with **one sheet per region** in the required structure/styling

