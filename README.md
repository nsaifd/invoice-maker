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

## Deploy to Cloudflare (free)
Live: https://invoice-maker.connect-saifd.workers.dev

The project is deployed as a Cloudflare Worker with static assets, configured in `wrangler.jsonc`
(SPA fallback so routes like `/invoices/1` survive a refresh).

- Cloudflare dashboard → **Workers & Pages** → **invoice-maker** is connected to this GitHub repo.
- Build command: `npm run build` · Deploy command: `npx wrangler deploy`
- Every push to `main` builds and deploys automatically.

Optional: **Settings → Domains & Routes** → add a custom domain such as `invoice.yourdomain.com`.

## Important
Data lives only in the browser where it was created. Use **Settings → Export backup** regularly.
