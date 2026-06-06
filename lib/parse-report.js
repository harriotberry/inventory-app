/**
 * parse-report.js
 * Parses a Cin7 inventory Excel (.xlsx) buffer into structured JSON.
 *
 * Rules applied:
 *  - Skip any row where product name contains "(12 Pack)"
 *  - Move the vintage year to the front of the product name
 *  - Strip "(6 Pack)" suffix from product names
 */

const XLSX = require('xlsx');

/**
 * Move vintage year to the front of a product name.
 * e.g. "Adelina Cabernet Franc 2022" → "2022 Adelina Cabernet Franc"
 *      "Zidarich Teran Rosso 14"     → "14 Zidarich Teran Rosso"
 */
function reformatName(name) {
  if (!name) return name;
  // Remove "(6 Pack)" suffix
  name = name.replace(/\s*\(6\s*Pack\)\s*$/i, '').trim();
  // 4-digit vintage at end (e.g. 2018, 2022)
  let m = name.match(/\s+((?:19|20)\d{2})$/);
  if (m) return `${m[1]} ${name.slice(0, m.index).trim()}`;
  // 2-digit vintage at end (e.g. 14, 16, 22)
  m = name.match(/\s+(1[0-9]|2[0-4])$/);
  if (m) return `${m[1]} ${name.slice(0, m.index).trim()}`;
  return name;
}

/**
 * Parse a Cin7 Excel buffer.
 * @param {Buffer} buffer
 * @returns {{ period: string, products: Array }}
 */
function parseReport(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Extract report date from the "To: DD-Mon-YYYY" row
  let period = 'Unknown date';
  for (const row of rows) {
    const cell = row[0] ? String(row[0]) : '';
    if (cell.startsWith('To: ')) {
      const raw = cell.replace('To: ', '').trim(); // e.g. "05-Jun-2026"
      const [day, mon, year] = raw.split('-');
      period = `${parseInt(day, 10)} ${mon} ${year}`;
      break;
    }
  }

  // Find the header row (first row where first cell is exactly "Location")
  const headerIdx = rows.findIndex(r => r[0] === 'Location');
  if (headerIdx === -1) throw new Error('Cannot find "Location" header row in Excel file');

  // Group rows by SKU → product object with locations array
  const bySkuMap = new Map();

  for (const row of rows.slice(headerIdx + 1)) {
    const [loc, sku, product, brand, onHand, allocated, onOrder, available, inTransit] = row;
    if (!loc || !sku) continue;
    if (product && /\(12\s*Pack\)/i.test(product)) continue;
    if (product && /\(6\s*Pack\)/i.test(product)) continue;

    if (!bySkuMap.has(sku)) {
      bySkuMap.set(sku, {
        sku: String(sku),
        product: reformatName(product ? String(product) : null),
        brand: brand ? String(brand) : '',
        locations: []
      });
    }

    bySkuMap.get(sku).locations.push({
      loc: String(loc),
      onHand:    Math.round(Number(onHand)    || 0),
      allocated: Math.round(Number(allocated) || 0),
      onOrder:   Math.round(Number(onOrder)   || 0),
      available: Math.round(Number(available) || 0),
      inTransit: Math.round(Number(inTransit) || 0),
    });
  }

  return {
    period,
    products: Array.from(bySkuMap.values())
  };
}

module.exports = { parseReport };
