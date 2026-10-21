# InvoiceKit

Invoice maker that runs entirely in the browser — no backend, no external APIs.
Data is stored in the browser (IndexedDB). Hosted free on Cloudflare Pages.

## Features (MVP)
- Invoice builder with live A4 preview
- Clients and products/services catalog
- Per-line VAT/tax, % or fixed discount, multi-currency (BDT, USD, EUR, GBP, INR)
- Auto invoice numbering (`INV-0001`, …)
- Download PDF (browser print → Save as PDF), email via your mail app
- Status tracking: Draft → Sent → Paid, automatic Overdue
- Business logo, brand color, bank / bKash / Nagad / Rocket payment details
- Backup export/import (JSON)

## Run locally
```bash
npm install
npm run dev
```

## Deploy to Cloudflare Pages (free)
1. Push this repo to GitHub.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select this repository, then set:
   - Framework preset: **React (Vite)** (or None)
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **Save and Deploy**. Every push to `main` redeploys automatically.

Optional: **Custom domains** → add e.g. `invoice.yourdomain.com`.

## Important
Data lives only in the browser where it was created. Use **Settings → Export backup** regularly.
