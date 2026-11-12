import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync } from 'node:crypto';
export const defaultDbPath=fileURLToPath(new URL('../data/app.sqlite',import.meta.url));
export function openDb(path=defaultDbPath) {
  if(path!==':memory:') mkdirSync(dirname(resolve(path)),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('STUDENT','MANAGER')), salt TEXT NOT NULL, password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity>0), manager_id INTEGER NOT NULL REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id), user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','CANCELLED','REVOKED')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(event_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS application_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      application_id INTEGER NOT NULL REFERENCES applications(id),
      actor_id INTEGER NOT NULL REFERENCES users(id),
      action TEXT NOT NULL CHECK(action IN ('APPLY','CANCEL','APPROVE','REVOKE','AUTO_APPROVE')),
      from_status TEXT CHECK(from_status IN ('PENDING','APPROVED','CANCELLED','REVOKED')),
      to_status TEXT NOT NULL CHECK(to_status IN ('PENDING','APPROVED','CANCELLED','REVOKED')),
      reason TEXT,
      cause_history_id INTEGER REFERENCES application_history(id),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );`);
  // 제공된 UNIQUE 제약은 최종 저장 단계의 중복 방어입니다.
  // 서비스가 중복을 감지하고 UNIQUE 제약 오류도 명세의 409 응답으로 변환합니다.
  if(db.prepare('SELECT COUNT(*) AS n FROM users').get().n===0) {
    db.exec('BEGIN');
    try {
      for(const [id,username,name,role] of [[1,'alice','민지','STUDENT'],[2,'bob','준호','STUDENT'],[3,'manager1','운영자 A','MANAGER'],[4,'manager2','운영자 B','MANAGER'],[5,'charlie','서연','STUDENT']]) {
        const salt=randomBytes(16).toString('hex');
        db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(id,username,name,role,salt,scryptSync('Classroom123!',salt,64).toString('hex'));
      }
      db.prepare('INSERT INTO events VALUES (?,?,?,?,?)').run(1,'함께 만드는 웹 서비스','정원 2명 · 운영자 A 담당',2,3);
      db.prepare('INSERT INTO events VALUES (?,?,?,?,?)').run(2,'서비스 설계 스터디','정원 1명 · 운영자 B 담당',1,4);
      db.exec('COMMIT');
    } catch(e) { db.exec('ROLLBACK'); throw e; }
  }
  return db;
}
