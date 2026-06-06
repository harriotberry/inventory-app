const busboy = require('busboy');
const { put, list, del } = require('@vercel/blob');
const { parseReport } = require('../lib/parse-report');

// Tell Vercel not to parse the request body — we do it ourselves with busboy
module.exports.config = {
  api: { bodyParser: false },
};

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

  // Verify secret token
  const secret = process.env.WEBHOOK_SECRET;
  if (secret && req.headers['x-webhook-secret'] !== secret) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const { excelBuffer, excelFilename } = await parseMultipart(req);

    if (!excelBuffer) {
      console.warn('No Excel attachment found');
      return res.status(400).send('No Excel attachment found');
    }

    console.log(`Processing attachment: ${excelFilename}`);

    const { period, products } = parseReport(excelBuffer);
    console.log(`Parsed report: ${period}, ${products.length} SKUs`);

    const payload = JSON.stringify({ reportDate: period, products });

    const { blobs } = await list({ prefix: 'inventory-latest' });
    if (blobs.length > 0) {
      await Promise.all(blobs.map(b => del(b.url)));
    }
    await put('inventory-latest.json', payload, {
      access: 'public',
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
