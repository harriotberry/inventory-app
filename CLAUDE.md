# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

This is a Vercel serverless app with no build step. Vercel auto-deploys from the `main` branch on GitHub.

**Data flow:**
1. Cin7 emails a daily stock report to `harriot@principalwine.com.au`
2. A Google Apps Script (external, not in this repo) runs at ~8:45am, downloads the Excel from the email link, and POSTs it to `/api/webhook`
3. `/api/webhook` parses the Excel via `lib/parse-report.js` and stores the result as `inventory-latest.json` in Vercel Blob
4. `/api/inventory` reads that blob and returns the JSON to the frontend
5. `public/index.html` is a single-file vanilla JS SPA that calls `/api/inventory` on load

**`db.js` is unused dead code** — an earlier SQLite approach that was replaced by Vercel Blob. Do not use it.

## Deployment

Push to `main` — Vercel auto-deploys within ~60 seconds.

```bash
git add <files>
git commit -m "your message"
git push
```

## Environment variables (Vercel)

| Variable | Purpose |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access — set automatically when blob store is connected |
| `WEBHOOK_SECRET` | Simple auth token checked via `x-webhook-secret` header on POST to `/api/webhook` |

Copy `BLOB_READ_WRITE_TOKEN` from Vercel → Storage → inventory-app-blob → `.env.local` for local testing.

## Testing the webhook

```bash
curl -X POST https://principalwine-dailystock.vercel.app/api/webhook \
  -H "x-webhook-secret: <WEBHOOK_SECRET>" \
  -F "attachment-1=@/path/to/InventoryStockLevel.xlsx;type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
```

The multipart field name must be `attachment-1`. The webhook accepts any `.xlsx` file with a spreadsheet MIME type.

**Caching:** `/api/inventory` uses `Cache-Control: private, no-cache` — no CDN caching. Vercel Blob's own CDN caches the underlying JSON file, so performance is still fast. This means the frontend always gets fresh data immediately after the webhook uploads a new report.

**Note:** The `start` script in `package.json` references `server.js` which does not exist. There is no local dev server — the app runs only on Vercel.

## Debugging a missed update

If the app shows a stale date after the morning webhook run:

1. Check Google Apps Script execution logs (script.google.com → the inventory script → Executions) — did it complete without error?
2. Check Vercel function logs (vercel.com → project → Functions → webhook) — was the webhook called?
3. Confirm blob contents: `curl "https://principalwine-dailystock.vercel.app/api/inventory?bust=1"` — if this shows today's date, it's a browser cache issue (hard refresh with Cmd+Shift+R).

## Search behaviour (`public/index.html`)

The search query is split into individual tokens (whitespace-delimited). All tokens must appear somewhere across the product name, brand, and SKU fields (AND logic, any order). This means "Frankland Cabernet" matches "2023 Frankland Estate Cabernet" even though the words are not adjacent. The `highlight` function also highlights each token independently.

## Parse rules (`lib/parse-report.js`)

- Skips rows where product name contains `(12 Pack)` or `(6 Pack)`
- Moves vintage year to the front of the product name (e.g. `"Adelina Cabernet 2022"` → `"2022 Adelina Cabernet"`)
- Strips `(6 Pack)` suffix before reformatting (separate from the skip rule above)
- Extracts report date from the `To: DD-Mon-YYYY` row
- Finds the data header by looking for the first row where column A is exactly `"Location"`
