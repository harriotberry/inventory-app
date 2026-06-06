# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

This is a Vercel serverless app with no build step. Vercel auto-deploys from the `main` branch on GitHub.

**Data flow:**
1. Cin7 emails a daily stock report to `harriot@principalwine.com.au`
2. A Google Apps Script (external, not in this repo) runs at 7am, downloads the Excel from the email link, and POSTs it to `/api/webhook`
3. `/api/webhook` parses the Excel via `lib/parse-report.js` and stores the result as `inventory-latest.json` in Vercel Blob
4. `/api/inventory` reads that blob and returns the JSON to the frontend
5. `public/index.html` is a single-file vanilla JS SPA that calls `/api/inventory` on load

**`db.js` is unused dead code** — an earlier SQLite approach that was replaced by Vercel Blob. Do not use it.

## Environment variables (Vercel)

| Variable | Purpose |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access — set automatically when blob store is connected |
| `WEBHOOK_SECRET` | Simple auth token checked via `x-webhook-secret` header on POST to `/api/webhook` |

Copy `BLOB_READ_WRITE_TOKEN` from Vercel → Storage → inventory-app-blob → `.env.local` for local testing.

## Testing the webhook locally

```bash
npm install --cache /tmp/npm-cache
curl -X POST https://inventory-app-eta-nine.vercel.app/api/webhook \
  -H "x-webhook-secret: <WEBHOOK_SECRET>" \
  -F "attachment-1=@/path/to/InventoryStockLevel.xlsx;type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
```

## Parse rules (`lib/parse-report.js`)

- Skips rows where product name contains `(12 Pack)` or `(6 Pack)`
- Moves vintage year to the front of the product name (e.g. `"Adelina Cabernet 2022"` → `"2022 Adelina Cabernet"`)
- Strips `(6 Pack)` suffix before reformatting (separate from the skip rule above)
- Extracts report date from the `To: DD-Mon-YYYY` row
- Finds the data header by looking for the first row where column A is exactly `"Location"`
