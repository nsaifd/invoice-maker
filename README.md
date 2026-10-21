# InvoiceKit

Invoice maker that runs entirely in the browser — no backend, no external APIs.
Data is stored in the browser (IndexedDB). Hosted free on Cloudflare Pages.

## Features
**Invoices**
- Invoice builder with live A4 preview, 3 templates (Minimal, Classic, Bold), font and brand color
- Clients and products/services catalog, per-line VAT, % or fixed discount, multi-currency
- Download PDF (browser print → Save as PDF), email, status tracking with automatic Overdue
- Recurring invoices (weekly / monthly / quarterly / yearly)
- Payment reminders via email or WhatsApp, "Needs attention" list for overdue and due-soon invoices

**Proposals**
- Block-based builder with drag-and-drop: Cover, Text, Scope, Pricing, Timeline, Signature
- Multi-page PDF, one-click convert to invoice

**Templates**
- 36 invoice designs across 10 layouts, 16 fonts (incl. Bangla), colors, table style, title, amount in words
- 20 proposal themes: 6 cover styles × 4 heading styles, separate heading and body fonts
- **Upload your own design** (PDF/PNG/JPG from Canva, Figma, Word): place live fields on top with a
  drag-and-drop designer (move, resize, snap, hide sample text). Invoices keep their editable items and totals.
  Proposals use an uploaded cover plus a letterhead; content is paginated inside a safe area you set.

**Share links** (`/p/:id`)
- Clients open proposals/invoices without logging in, comment, and accept or decline
- E-signature (draw or type) with audit trail: name, email, time, IP address, browser
- View tracking: number of opens, devices, last opened, time spent on each section

**Data**
- Your business data stays in the browser (IndexedDB); export/import JSON backups in Settings
- Only documents you choose to share are stored on the server (Cloudflare D1)

## Run locally
```bash
npm install
npm run dev          # UI only (share links need the Worker)
npm run preview:cf   # full app incl. Worker + local D1 at http://localhost:8787
```

## Deploy to Cloudflare (free)
Live: https://involet.saifux.co (also https://invoice-maker.connect-saifd.workers.dev)

The project is a Cloudflare Worker with static assets, configured in `wrangler.jsonc`:
- `dist/` is served as a single-page app (routes like `/invoices/1` survive a refresh)
- `worker/index.ts` handles `/api/*` (share links) and stores data in a D1 database
  (`invoice-maker-db`), which Wrangler creates automatically on first deploy.
  Tables are created by the Worker on first use.

- Cloudflare dashboard → **Workers & Pages** → **invoice-maker** is connected to this GitHub repo.
- Build command: `npm run build` · Deploy command: `npx wrangler deploy`
- Every push to `main` builds and deploys automatically.

Optional: **Settings → Domains & Routes** → add a custom domain such as `invoice.yourdomain.com`.

## Important
Data lives only in the browser where it was created. Use **Settings → Export backup** regularly.

