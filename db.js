const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'inventory.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    period  TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id   INTEGER NOT NULL REFERENCES reports(id),
    sku         TEXT NOT NULL,
    product     TEXT,
    brand       TEXT,
    location    TEXT NOT NULL,
    on_hand     INTEGER NOT NULL DEFAULT 0,
    allocated   INTEGER NOT NULL DEFAULT 0,
    on_order    INTEGER NOT NULL DEFAULT 0,
    available   INTEGER NOT NULL DEFAULT 0,
    in_transit  INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_inventory_report ON inventory(report_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_sku    ON inventory(sku);
`);

// ── Queries ───────────────────────────────────────────────────────────────────

const stmtInsertReport = db.prepare(
  `INSERT INTO reports (period) VALUES (?) RETURNING id`
);

const stmtInsertRow = db.prepare(`
  INSERT INTO inventory (report_id, sku, product, brand, location,
    on_hand, allocated, on_order, available, in_transit)
  VALUES (@reportId, @sku, @product, @brand, @location,
    @onHand, @allocated, @onOrder, @available, @inTransit)
`);

const stmtLatestReport = db.prepare(
  `SELECT id, period, received_at FROM reports ORDER BY id DESC LIMIT 1`
);

const stmtInventoryForReport = db.prepare(
  `SELECT sku, product, brand, location, on_hand, allocated, on_order, available, in_transit
   FROM inventory WHERE report_id = ? ORDER BY brand, product, sku, location`
);

/**
 * Save a new report. Replaces all previous data.
 * @param {string} period  - e.g. "5 Jun 2026"
 * @param {Array}  rows    - parsed inventory rows
 */
function saveReport(period, rows) {
  db.transaction(() => {
    const { id: reportId } = stmtInsertReport.get(period);
    for (const row of rows) {
      stmtInsertRow.run({ reportId, ...row });
    }
    // Keep only the latest 30 reports to avoid unbounded growth
    db.prepare(
      `DELETE FROM reports WHERE id NOT IN (SELECT id FROM reports ORDER BY id DESC LIMIT 30)`
    ).run();
    db.prepare(
      `DELETE FROM inventory WHERE report_id NOT IN (SELECT id FROM reports)`
    ).run();
  })();
  return reportId;
}

/**
 * Returns the latest inventory as an array of product objects,
 * each with a `locations` array.
 */
function getLatestInventory() {
  const report = stmtLatestReport.get();
  if (!report) return { reportDate: null, products: [] };

  const rows = stmtInventoryForReport.all(report.id);

  // Group rows by SKU
  const bySkuMap = new Map();
  for (const row of rows) {
    if (!bySkuMap.has(row.sku)) {
      bySkuMap.set(row.sku, {
        sku: row.sku,
        product: row.product,
        brand: row.brand,
        locations: []
      });
    }
    bySkuMap.get(row.sku).locations.push({
      loc: row.location,
      onHand: row.on_hand,
      allocated: row.allocated,
      onOrder: row.on_order,
      available: row.available,
      inTransit: row.in_transit
    });
  }

  return {
    reportDate: report.period,
    products: Array.from(bySkuMap.values())
  };
}

module.exports = { saveReport, getLatestInventory };
