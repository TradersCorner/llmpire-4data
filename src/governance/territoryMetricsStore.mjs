// src/governance/territoryMetricsStore.mjs
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'governance.sqlite');

function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function createTerritoryMetricsStore({ dbPath = DEFAULT_DB_PATH } = {}) {
  ensureDir(dbPath);
  const db = new Database(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS territory_metrics (
      territory_id TEXT NOT NULL,
      window TEXT NOT NULL,
      computed_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (territory_id, window, computed_at)
    );

    CREATE INDEX IF NOT EXISTS idx_territory_window
      ON territory_metrics (territory_id, window, computed_at DESC);
  `);

  const upsertStmt = db.prepare(`
    INSERT INTO territory_metrics (territory_id, window, computed_at, payload)
    VALUES (@territoryId, @window, @computedAt, @payload)
    ON CONFLICT(territory_id, window, computed_at)
    DO UPDATE SET payload = excluded.payload
  `);

  const getLatestStmt = db.prepare(`
    SELECT payload
    FROM territory_metrics
    WHERE territory_id = ? AND window = ?
    ORDER BY computed_at DESC
    LIMIT 1
  `);

  const listLatestByWindowStmt = db.prepare(`
    SELECT tm.territory_id as territory_id, tm.payload as payload
    FROM territory_metrics tm
    JOIN (
      SELECT territory_id, MAX(computed_at) AS max_computed_at
      FROM territory_metrics
      WHERE window = ?
      GROUP BY territory_id
    ) latest
      ON latest.territory_id = tm.territory_id
     AND latest.max_computed_at = tm.computed_at
    WHERE tm.window = ?
    ORDER BY tm.territory_id ASC
  `);

  const historyStmt = db.prepare(`
    SELECT payload
    FROM territory_metrics
    WHERE territory_id = ? AND window = ?
    ORDER BY computed_at DESC
    LIMIT ?
  `);

  return {
    upsert(metrics) {
      if (!metrics?.territoryId || !metrics?.window || !metrics?.computedAt) {
        throw new Error('Invalid TerritoryMetrics payload');
      }
      upsertStmt.run({
        territoryId: metrics.territoryId,
        window: metrics.window,
        computedAt: metrics.computedAt,
        payload: JSON.stringify(metrics),
      });
    },

    getLatest({ territoryId, window }) {
      const row = getLatestStmt.get(territoryId, window);
      return row ? JSON.parse(row.payload) : null;
    },

    listLatest({ window }) {
      const rows = listLatestByWindowStmt.all(window, window);
      return rows.map((r) => JSON.parse(r.payload));
    },

    history({ territoryId, window, limit = 30 }) {
      const rows = historyStmt.all(territoryId, window, limit);
      return rows.map((r) => JSON.parse(r.payload));
    },

    close() {
      db.close();
    },
  };
}
