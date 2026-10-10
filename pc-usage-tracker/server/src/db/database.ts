import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config';

export type Db = DatabaseSync;

export function runMigrations(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name TEXT NOT NULL,
      container_names TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_seconds INTEGER,
      hourly_rate_eur REAL NOT NULL,
      amount_due_eur REAL,
      avg_cpu_percent REAL,
      avg_ram_mb REAL,
      avg_gpu_percent REAL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
    CREATE INDEX IF NOT EXISTS idx_sessions_end_time ON sessions(end_time);

    CREATE TABLE IF NOT EXISTS resource_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      timestamp TEXT NOT NULL,
      cpu_percent REAL NOT NULL,
      ram_used_mb REAL NOT NULL,
      gpu_percent REAL
    );

    CREATE INDEX IF NOT EXISTS idx_resource_samples_session ON resource_samples(session_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function openDatabase(): Db {
  const dir = path.dirname(config.databasePath);
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(config.databasePath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  runMigrations(db);
  return db;
}
