// Supplemental two-process checks for duplicate application and repeated revocation races.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';

test('동시 중복 신청과 동일 승인 취소를 두 서버에서 직렬화', { timeout: 60000 }, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'applyflow-races-'));
  const path = join(dir, 'shared.sqlite');
  const secret = randomBytes(48).toString('hex');
  const db = openDb(path);
  const children = [];
  t.after(async () => {
    for (const child of children) {
      if (child.exitCode === null) {
        child.send('stop');
        await new Promise(resolve => child.once('exit', resolve));
      }
    }
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function worker() {
    const child = fork(fileURLToPath(new URL('./server-worker.js', import.meta.url)), [path, secret], { silent: true });
    children.push(child);
    return new Promise((resolve, reject) => {
      child.once('message', message => resolve(`http://127.0.0.1:${message.port}`));
      child.once('error', reject);
      child.once('exit', code => reject(new Error(`서버 종료 ${code}`)));
    });
  }
  const [serverA, serverB] = await Promise.all([worker(), worker()]);
  async function request(base, route, token, body = {}, method = 'POST') {
    const response = await fetch(base + route, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  }
  async function login(base, username) {
    return (await request(base, '/api/auth/login', null, { username, password: 'Classroom123!' })).data.accessToken;
  }
  const alice = await login(serverA, 'alice');
  const bob = await login(serverB, 'bob');
  const manager = await login(serverA, 'manager1');

  for (let iteration = 0; iteration < 10; iteration++) {
    db.exec('DELETE FROM application_history; DELETE FROM applications');
    const duplicate = await Promise.all([
      request(serverA, '/api/events/1/applications', alice),
      request(serverB, '/api/events/1/applications', alice)
    ]);
    assert.deepEqual(duplicate.map(result => result.status).sort(), [201, 409]);
    assert.equal(duplicate.find(result => result.status === 409).data.code, 'ALREADY_APPLIED');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM applications WHERE event_id=1 AND user_id=1').get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM application_history WHERE action='APPLY'").get().n, 1);

    db.exec('DELETE FROM application_history; DELETE FROM applications');
    const distinctStudents = await Promise.all([
      request(serverA, '/api/events/1/applications', alice),
      request(serverB, '/api/events/1/applications', bob)
    ]);
    assert.deepEqual(distinctStudents.map(result => result.status), [201, 201]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM applications WHERE event_id=1').get().n, 2);

    db.exec('DELETE FROM application_history; DELETE FROM applications');
    const insert = db.prepare('INSERT INTO applications(event_id,user_id,status,created_at) VALUES (1,?,? ,?)');
    const approvedId = Number(insert.run(1, 'APPROVED', '2026-11-01T00:00:00.000Z').lastInsertRowid);
    const firstPendingId = Number(insert.run(2, 'PENDING', '2026-11-02T00:00:00.000Z').lastInsertRowid);
    const secondPendingId = Number(insert.run(5, 'PENDING', '2026-11-03T00:00:00.000Z').lastInsertRowid);
    const hist = db.prepare('INSERT INTO application_history(application_id,actor_id,action,from_status,to_status) VALUES (?,?,?,?,?)');
    hist.run(approvedId, 1, 'APPLY', null, 'PENDING');
    hist.run(approvedId, 3, 'APPROVE', 'PENDING', 'APPROVED');
    hist.run(firstPendingId, 2, 'APPLY', null, 'PENDING');
    hist.run(secondPendingId, 5, 'APPLY', null, 'PENDING');

    const revoke = await Promise.all([
      request(serverA, `/api/applications/${approvedId}/revoke`, manager, { reason: '운영 사정으로 승인 취소' }),
      request(serverB, `/api/applications/${approvedId}/revoke`, manager, { reason: '운영 사정으로 승인 취소' })
    ]);
    assert.deepEqual(revoke.map(result => result.status).sort(), [200, 409]);
    assert.equal(revoke.find(result => result.status === 409).data.code, 'INVALID_STATE');
    assert.equal(db.prepare('SELECT status FROM applications WHERE id=?').get(approvedId).status, 'REVOKED');
    assert.equal(db.prepare('SELECT status FROM applications WHERE id=?').get(firstPendingId).status, 'APPROVED');
    assert.equal(db.prepare('SELECT status FROM applications WHERE id=?').get(secondPendingId).status, 'PENDING');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM application_history WHERE action='REVOKE'").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM application_history WHERE action='AUTO_APPROVE'").get().n, 1);
    const cause = db.prepare("SELECT cause_history_id AS id FROM application_history WHERE action='AUTO_APPROVE'").get().id;
    assert.equal(db.prepare("SELECT id FROM application_history WHERE action='REVOKE'").get().id, cause);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  }
});
