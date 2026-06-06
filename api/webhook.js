/**
 * api/webhook.js
 * Receives the daily Cin7 inventory report from Mailgun.
 *
 * Mailgun sends a multipart POST to this endpoint whenever an email
 * arrives at your inbound address. This handler:
 *   1. Verifies the request is genuinely from Mailgun (signature check)
 *   2. Finds the Excel (.xlsx) attachment
 *   3. Parses it with parse-report.js
 *   4. Saves the result to Vercel Blob storage
 */

const busboy = require('busboy');
const crypto = require('crypto');
const { put, list, del } = require('@vercel/blob');
const { parseReport } = require('../lib/parse-report');

// Tell Vercel not to parse the request body — we do it ourselves with busboy
module.exports.config = {
  api: { bodyParser: false },
};

// ── Mailgun signature verification ───────────────────────────────────────────
function verifyMailgunSignature(signingKey, timestamp, token, signature) {
  if (!signingKey) return true; // skip if key not configured
  const hash = crypto
    .createHmac('sha256', signingKey)
    .update(timestamp + token)
    .digest('hex');
  return hash === signature;
}

// ── Multipart parser ──────────────────────────────────────────────────────────
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let excelBuffer = null;
    let excelFilename = null;

    const bb = busboy({ headers: req.headers, limits: { fileSize: 20 * 1024 * 1024 } });

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('file', (fieldname, stream, info) => {
      const chunks = [];
      const isExcel =
        (info.mimeType && info.mimeType.includes('spreadsheet')) ||
        (info.filename && info.filename.toLowerCase().endsWith('.xlsx'));

      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => {
        if (isExcel) {
          excelBuffer = Buffer.concat(chunks);
          excelFilename = info.filename;
        }
      });
      stream.resume(); // drain even if not Excel
    });

    bb.on('finish', () => resolve({ fields, excelBuffer, excelFilename }));
    bb.on('error', reject);
    req.pipe(bb);
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { fields, excelBuffer, excelFilename } = await parseMultipart(req);

    // Verify the request came from Mailgun
    const signingKey = process.env.MAILGUN_SIGNING_KEY;
    if (signingKey) {
      const { timestamp, token, signature } = fields;
      if (!verifyMailgunSignature(signingKey, timestamp, token, signature)) {
        console.warn('Mailgun signature verification failed');
        return res.status(401).send('Unauthorized');
      }
    }

    if (!excelBuffer) {
      console.warn('No Excel attachment found in email');
      return res.status(400).send('No Excel attachment found');
    }

    console.log(`Processing attachment: ${excelFilename}`);

    // Parse the Excel report
    const { period, products } = parseReport(excelBuffer);
    console.log(`Parsed report: ${period}, ${products.length} SKUs`);

    const payload = JSON.stringify({ reportDate: period, products });

    // Replace any existing stored report
    const { blobs } = await list({ prefix: 'inventory-latest' });
    if (blobs.length > 0) {
      await Promise.all(blobs.map(b => del(b.url)));
    }
    await put('inventory-latest.json', payload, {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
    });

    console.log('Inventory saved to blob storage');
    return res.status(200).send('OK');

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).send(`Webhook error: ${err.message}`);
  }
};
