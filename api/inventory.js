/**
 * api/inventory.js
 * Returns the latest parsed inventory as JSON.
 * Called by the frontend on every page load.
 */

const { list } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const { blobs } = await list({ prefix: 'inventory-latest' });

    if (!blobs.length) {
      // No report has been received yet
      return res.status(200).json({ reportDate: null, products: [] });
    }

    // Get the most recently uploaded blob (there should only be one)
    const latest = blobs.sort(
      (a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)
    )[0];

    const response = await fetch(latest.url);
    if (!response.ok) throw new Error(`Blob fetch failed: ${response.status}`);
    const data = await response.json();

    res.setHeader('Cache-Control', 'private, no-cache');
    return res.status(200).json(data);

  } catch (err) {
    console.error('Inventory API error:', err);
    return res.status(500).json({ error: 'Failed to load inventory data' });
  }
};
