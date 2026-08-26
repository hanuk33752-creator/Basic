import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, 'app.db');
export const db = new DatabaseSync(dbPath);

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

/** SELECT 다건 */
export function all(sql, ...params) {
  return db.prepare(sql).all(...params).map(toPlain);
}

/** SELECT 단건 */
export function get(sql, ...params) {
  const row = db.prepare(sql).get(...params);
  return row ? toPlain(row) : undefined;
}

/** INSERT/UPDATE/DELETE */
export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// node:sqlite 는 null-prototype 객체를 돌려주므로 JSON 직렬화용으로 평탄화한다.
function toPlain(row) {
  return { ...row };
}

export { dbPath };
