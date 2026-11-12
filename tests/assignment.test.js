// 완성본 요구사항 검사입니다. 시작 코드에서는 501 때문에 실패하는 것이 정상입니다.
// 기대값을 바꾸거나 테스트를 삭제하는 것은 구현 완료가 아닙니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { fixture } from './helpers.js';
function expect(r,status,code){assert.equal(r.status,status,JSON.stringify(r.data));if(code)assert.equal(r.data.code,code);}
async function created(f,name='alice',event=1){const r=await f.apply(name,event);expect(r,201);return r.data;}
test('T01 정상 신청은 본인 ID와 PENDING으로 저장',async t=>{const f=await fixture(t);const r=await f.apply('alice');expect(r,201);assert.equal(r.data.userId,1);assert.equal(r.data.status,'PENDING');assert.equal(r.location,`/api/applications/${r.data.id}`);assert.equal(f.snapshot().length,1);});
test('T02 비로그인·위조 토큰의 변경은 401, 데이터 불변',async t=>{const f=await fixture(t);for(const token of [undefined,'invalid'])expect(await f.request('/api/events/1/applications',{method:'POST',token,body:{}}),401);assert.equal(f.snapshot().length,0);});
test('T03 userId·role·status 위조는 400, 데이터 불변',async t=>{const f=await fixture(t);for(const body of [{userId:2},{role:'MANAGER'},{status:'APPROVED'}])expect(await f.request('/api/events/1/applications',{method:'POST',token:f.tokens.alice,body}),400,'BAD_INPUT');assert.equal(f.snapshot().length,0);});
test('T04 대기·취소·승인 상태의 기존 신청은 모두 중복',async t=>{const f=await fixture(t);const a=await created(f);let before=f.snapshot();expect(await f.apply('alice'),409,'ALREADY_APPLIED');assert.deepEqual(f.snapshot(),before);expect(await f.action('alice',a.id,'cancel'),200);before=f.snapshot();expect(await f.apply('alice'),409,'ALREADY_APPLIED');assert.deepEqual(f.snapshot(),before);const b=await created(f,'bob');expect(await f.action('manager1',b.id,'approve'),200);before=f.snapshot();expect(await f.apply('bob'),409,'ALREADY_APPLIED');assert.deepEqual(f.snapshot(),before);});
test('T05 같은 학생이 다른 행사에 신청 가능',async t=>{const f=await fixture(t);await created(f);await created(f,'alice',2);assert.equal(f.snapshot().length,2);});
test('T06 본인의 대기 신청 취소 성공',async t=>{const f=await fixture(t);const a=await created(f);expect(await f.action('alice',a.id,'cancel'),200);assert.equal((await f.get('alice',a.id)).data.status,'CANCELLED');});
test('T07 타인·운영자의 학생 신청 취소는 403',async t=>{const f=await fixture(t);const a=await created(f),before=f.snapshot();for(const user of ['bob','manager1'])expect(await f.action(user,a.id,'cancel'),403,'FORBIDDEN');assert.deepEqual(f.snapshot(),before);});
test('T08 담당 운영자의 대기 신청 승인 성공',async t=>{const f=await fixture(t);const a=await created(f);expect(await f.action('manager1',a.id,'approve'),200);assert.equal((await f.get('alice',a.id)).data.status,'APPROVED');assert.equal((await f.request('/api/events')).data[0].approvedCount,1);});
test('T09 학생·다른 행사 운영자의 승인은 403',async t=>{const f=await fixture(t);const a=await created(f),before=f.snapshot();for(const user of ['alice','manager2'])expect(await f.action(user,a.id,'approve'),403,'FORBIDDEN');assert.deepEqual(f.snapshot(),before);});
test('T10 취소 후 오래된 화면의 승인은 409, 취소 유지',async t=>{const f=await fixture(t);const a=await created(f);expect(await f.action('alice',a.id,'cancel'),200);const before=f.snapshot();expect(await f.action('manager1',a.id,'approve'),409,'INVALID_STATE');assert.deepEqual(f.snapshot(),before);});
test('T11 승인 후 재승인·본인 취소는 409, 승인 유지',async t=>{const f=await fixture(t);const a=await created(f);expect(await f.action('manager1',a.id,'approve'),200);const before=f.snapshot();expect(await f.action('manager1',a.id,'approve'),409,'INVALID_STATE');expect(await f.action('alice',a.id,'cancel'),409,'INVALID_STATE');assert.deepEqual(f.snapshot(),before);});
test('T12 취소 후 다시 취소는 409, 데이터 불변',async t=>{const f=await fixture(t);const a=await created(f);expect(await f.action('alice',a.id,'cancel'),200);const before=f.snapshot();expect(await f.action('alice',a.id,'cancel'),409,'INVALID_STATE');assert.deepEqual(f.snapshot(),before);});
test('T13 정원은 승인 인원 기준, 초과 요청은 대기 유지',async t=>{const f=await fixture(t);const a=await created(f),b=await created(f,'bob'),c=await created(f,'charlie');expect(await f.action('manager1',a.id,'approve'),200);expect(await f.action('manager1',b.id,'approve'),200);const before=f.snapshot();expect(await f.action('manager1',c.id,'approve'),409,'CAPACITY_FULL');assert.deepEqual(f.snapshot(),before);assert.equal((await f.request('/api/events')).data[0].approvedCount,2);assert.equal((await f.get('charlie',c.id)).data.status,'PENDING');});
test('T14 역할·대상·상태 검사 순서',async t=>{const f=await fixture(t);expect(await f.apply('manager1'),403,'FORBIDDEN');expect(await f.apply('alice',9999),404,'NOT_FOUND');expect(await f.action('manager1',9999,'approve'),404,'NOT_FOUND');expect(await f.action('alice',9999,'cancel'),404,'NOT_FOUND');const a=await created(f);expect(await f.action('alice',a.id,'cancel'),200);expect(await f.action('manager2',a.id,'approve'),403,'FORBIDDEN');});
test('T15 잘못된 ID, 다른 사람의 상세 조회 거부',async t=>{const f=await fixture(t);expect(await f.request('/api/events/abc/applications',{method:'POST',token:f.tokens.alice,body:{}}),400,'BAD_INPUT');const a=await created(f);expect(await f.get('bob',a.id),403,'FORBIDDEN');expect(await f.get('manager2',a.id),403,'FORBIDDEN');});
test('T16 DB 재연결 후 신청과 상태 유지',async t=>{const f=await fixture(t);const a=await created(f);expect(await f.action('manager1',a.id,'approve'),200);await f.stop();const db=openDb(f.path);try{const r=db.prepare('SELECT user_id,status FROM applications WHERE id=?').get(a.id);assert.equal(r.user_id,1);assert.equal(r.status,'APPROVED');}finally{db.close();}});

const full=f=>({applications:f.snapshot(),history:f.db.prepare('SELECT * FROM application_history ORDER BY id').all()});
const histories=(f,id)=>f.request(`/api/applications/${id}/history`,{token:f.tokens.manager1});
async function approved(f,name='alice',event=1){const a=await created(f,name,event);expect(await f.action(event===1?'manager1':'manager2',a.id,'approve'),200);return a;}
async function revoke(f,name,id,reason='운영 사정으로 승인 취소') {return f.request(`/api/applications/${id}/revoke`,{method:'POST',token:f.tokens[name],body:{reason}});}
test('T17 승인 취소: 대기자가 없으면 REVOKED, promoted=null',async t=>{
 const f=await fixture(t),a=await approved(f);const r=await revoke(f,'manager1',a.id);expect(r,200);
 assert.equal(r.data.revoked.status,'REVOKED');assert.equal(r.data.promoted,null);
 assert.equal((await f.get('alice',a.id)).data.status,'REVOKED');assert.equal((await f.request('/api/events')).data[0].approvedCount,0);
 expect(await f.apply('alice'),409,'ALREADY_APPLIED');
});
test('T18 자동 승급: 같은 행사 created_at이 가장 이른 대기자',async t=>{
 const f=await fixture(t),a=await approved(f,'alice',2),b=await created(f,'bob',2),c=await created(f,'charlie',2);
 f.db.prepare('UPDATE applications SET created_at=? WHERE id=?').run('2026-11-02T00:00:00.000Z',b.id);
 f.db.prepare('UPDATE applications SET created_at=? WHERE id=?').run('2026-11-01T00:00:00.000Z',c.id);
 const r=await revoke(f,'manager2',a.id);expect(r,200);assert.equal(r.data.promoted.id,c.id);assert.equal(r.data.promoted.status,'APPROVED');assert.equal((await f.get('bob',b.id)).data.status,'PENDING');
 assert.equal((await f.request('/api/events')).data[1].approvedCount,1);
});
test('T19 자동 승급: 시각이 같으면 ID 오름차순',async t=>{
 const f=await fixture(t),a=await approved(f,'alice',2),b=await created(f,'bob',2),c=await created(f,'charlie',2);
 f.db.prepare("UPDATE applications SET created_at='2026-11-01T00:00:00.000Z' WHERE status='PENDING'").run();
 const r=await revoke(f,'manager2',a.id);expect(r,200);assert.equal(r.data.promoted.id,b.id);assert.equal((await f.get('charlie',c.id)).data.status,'PENDING');
});
test('T20 자동 승급 대상에서 취소자·다른 행사를 제외',async t=>{
 const f=await fixture(t),a=await approved(f,'alice',2),b=await created(f,'bob',2),c=await created(f,'charlie',1);
 expect(await f.action('bob',b.id,'cancel'),200);const r=await revoke(f,'manager2',a.id);expect(r,200);assert.equal(r.data.promoted,null);
 assert.equal((await f.get('bob',b.id)).data.status,'CANCELLED');assert.equal((await f.get('charlie',c.id)).data.status,'PENDING');
});
test('T21 승인 취소 권한: 학생·다른 운영자·토큰 누락 거부',async t=>{
 const f=await fixture(t),a=await approved(f),before=full(f);
 for(const name of ['alice','bob','manager2'])expect(await revoke(f,name,a.id),403,'FORBIDDEN');
 expect(await revoke(f,'nobody',a.id),401);assert.deepEqual(full(f),before);
});
test('T22 승인 취소 상태: 대기·대기 취소·승인 취소 상태 거부',async t=>{
 const f=await fixture(t),a=await created(f);let before=full(f);
 expect(await revoke(f,'manager1',a.id),409,'INVALID_STATE');assert.deepEqual(full(f),before);
 expect(await f.action('alice',a.id,'cancel'),200);before=full(f);expect(await revoke(f,'manager1',a.id),409,'INVALID_STATE');assert.deepEqual(full(f),before);
 const b=await approved(f,'bob');expect(await revoke(f,'manager1',b.id),200);before=full(f);
 expect(await revoke(f,'manager1',b.id),409,'INVALID_STATE');assert.deepEqual(full(f),before);
 expect(await f.action('manager1',b.id,'approve'),409,'INVALID_STATE');expect(await f.action('bob',b.id,'cancel'),409,'INVALID_STATE');assert.deepEqual(full(f),before);
});
test('T23 승인 취소 사유: trim 후 5~200자, 추가 필드 거부',async t=>{
 const f=await fixture(t),a=await approved(f),before=full(f);
 for(const body of [{},{reason:12},{reason:'    '},{reason:'abcd'},{reason:'x'.repeat(201)},{reason:'유효한 취소 사유',actorId:4}])
  expect(await f.request(`/api/applications/${a.id}/revoke`,{method:'POST',token:f.tokens.manager1,body}),400,'BAD_INPUT');
 assert.deepEqual(full(f),before);expect(await revoke(f,'manager1',a.id,'  운영 사정으로 취소  '),200);
 const h=(await histories(f,a.id)).data.at(-1);assert.equal(h.reason,'운영 사정으로 취소');
});
test('T24 신청·취소·승인 이력의 행위자·전후 상태·순서',async t=>{
 const f=await fixture(t),a=await created(f),b=await created(f,'bob');expect(await f.action('alice',a.id,'cancel'),200);expect(await f.action('manager1',b.id,'approve'),200);
 const ah=(await histories(f,a.id)).data,bh=(await histories(f,b.id)).data;
 assert.equal(ah.length,2);assert.equal(bh.length,2);
 for(const [h,actor,action,from,to,id] of [[ah[0],1,'APPLY',null,'PENDING',a.id],[ah[1],1,'CANCEL','PENDING','CANCELLED',a.id],[bh[0],2,'APPLY',null,'PENDING',b.id],[bh[1],3,'APPROVE','PENDING','APPROVED',b.id]]){
  assert.equal(h.actorId,actor);assert.equal(h.action,action);assert.equal(h.fromStatus,from);assert.equal(h.toStatus,to);assert.equal(h.applicationId,id);assert.equal(h.reason,null);assert.equal(h.causeHistoryId,null);assert.ok(Number.isFinite(Date.parse(h.createdAt)));
 }
 assert.ok(ah[0].id<ah[1].id);assert.ok(bh[0].id<bh[1].id);
});
test('T25 승인 취소와 자동 승급 이력을 원인 ID로 연결',async t=>{
 const f=await fixture(t),a=await approved(f),b=await created(f,'bob');const r=await revoke(f,'manager1',a.id);expect(r,200);
 const h=(await histories(f,a.id)).data.at(-1),p=(await histories(f,b.id)).data.at(-1);
 assert.equal(h.action,'REVOKE');assert.equal(h.fromStatus,'APPROVED');assert.equal(h.toStatus,'REVOKED');assert.equal(h.actorId,3);assert.equal(h.causeHistoryId,null);assert.equal(h.reason,'운영 사정으로 승인 취소');
 assert.equal(p.action,'AUTO_APPROVE');assert.equal(p.fromStatus,'PENDING');assert.equal(p.toStatus,'APPROVED');assert.equal(p.actorId,3);assert.equal(p.causeHistoryId,h.id);assert.equal(p.reason,null);assert.ok(p.id>h.id);
 assert.equal((await histories(f,a.id)).data.length,3);assert.equal((await histories(f,b.id)).data.length,2);
});
test('T26 거부된 요청은 상태와 성공 이력을 모두 변경하지 않음',async t=>{
 const f=await fixture(t),a=await approved(f,'alice',2),b=await created(f,'bob',2),before=full(f);
 expect(await f.action('manager2',b.id,'approve'),409,'CAPACITY_FULL');expect(await f.apply('alice',2),409,'ALREADY_APPLIED');expect(await f.action('alice',a.id,'cancel'),409,'INVALID_STATE');expect(await revoke(f,'manager1',a.id),403,'FORBIDDEN');assert.deepEqual(full(f),before);
});
test('T27 변경 이력 조회: 본인·담당 운영자만 허용',async t=>{
 const f=await fixture(t),a=await created(f);
 for(const name of ['alice','manager1'])expect(await f.request(`/api/applications/${a.id}/history`,{token:f.tokens[name]}),200);
 for(const name of ['bob','manager2'])expect(await f.request(`/api/applications/${a.id}/history`,{token:f.tokens[name]}),403,'FORBIDDEN');
 expect(await f.request(`/api/applications/${a.id}/history`),401);
 expect(await f.request('/api/applications/9999/history',{token:f.tokens.alice}),404,'NOT_FOUND');
});
test('T28 신청 이력 저장 실패 시 신청 저장도 롤백',async t=>{
 const f=await fixture(t),before=full(f);
 f.db.exec("CREATE TRIGGER fail_apply BEFORE INSERT ON application_history WHEN NEW.action='APPLY' BEGIN SELECT RAISE(ABORT,'TEST_INJECTED_FAILURE'); END");
 expect(await f.apply('alice'),500,'INTERNAL_ERROR');assert.deepEqual(full(f),before);
 f.db.exec('DROP TRIGGER fail_apply');expect(await f.apply('alice'),201);
});
test('T29 자동 승급 이력 저장 실패 시 두 상태와 두 이력 모두 롤백',async t=>{
 const f=await fixture(t),a=await approved(f),b=await created(f,'bob'),before=full(f);
 f.db.exec("CREATE TRIGGER fail_auto BEFORE INSERT ON application_history WHEN NEW.action='AUTO_APPROVE' BEGIN SELECT RAISE(ABORT,'TEST_INJECTED_FAILURE'); END");
 expect(await revoke(f,'manager1',a.id),500,'INTERNAL_ERROR');assert.deepEqual(full(f),before);
 f.db.exec('DROP TRIGGER fail_auto');const r=await revoke(f,'manager1',a.id);expect(r,200);assert.equal(r.data.promoted.id,b.id);
});
test('T30 승인·대기 취소·승인 취소 이력 실패도 롤백',async t=>{
 const f=await fixture(t),a=await created(f),b=await created(f,'bob');
 for(const [action,call] of [['APPROVE',()=>f.action('manager1',a.id,'approve')],['CANCEL',()=>f.action('bob',b.id,'cancel')]]){
  const before=full(f);f.db.exec(`CREATE TRIGGER fail_change BEFORE INSERT ON application_history WHEN NEW.action='${action}' BEGIN SELECT RAISE(ABORT,'TEST_INJECTED_FAILURE'); END`);
  expect(await call(),500,'INTERNAL_ERROR');assert.deepEqual(full(f),before);f.db.exec('DROP TRIGGER fail_change');
 }
 expect(await f.action('manager1',a.id,'approve'),200);const before=full(f);
 f.db.exec("CREATE TRIGGER fail_revoke BEFORE INSERT ON application_history WHEN NEW.action='REVOKE' BEGIN SELECT RAISE(ABORT,'TEST_INJECTED_FAILURE'); END");
 expect(await revoke(f,'manager1',a.id),500,'INTERNAL_ERROR');assert.deepEqual(full(f),before);
});
test('T31 DB 재연결 후 승인 취소·승급 상태와 원인 이력 유지',async t=>{
 const f=await fixture(t),a=await approved(f),b=await created(f,'bob');expect(await revoke(f,'manager1',a.id),200);const before=full(f);await f.stop();
 const db=openDb(f.path);try{assert.deepEqual(db.prepare('SELECT * FROM applications ORDER BY id').all(),before.applications);assert.deepEqual(db.prepare('SELECT * FROM application_history ORDER BY id').all(),before.history);}finally{db.close();}
});
test('T32 연속 승인 취소: 요청당 최대 한 명 승급, 정원·중복 이력 보호',async t=>{
 const f=await fixture(t),a=await approved(f),b=await approved(f,'bob'),c=await created(f,'charlie');
 const first=await revoke(f,'manager1',a.id);expect(first,200);assert.equal(first.data.promoted.id,c.id);
 const second=await revoke(f,'manager1',b.id);expect(second,200);assert.equal(second.data.promoted,null);
 assert.equal((await f.request('/api/events')).data[0].approvedCount,1);const before=full(f);
 expect(await revoke(f,'manager1',a.id),409,'INVALID_STATE');assert.deepEqual(full(f),before);
 assert.equal(before.history.filter(h=>h.action==='AUTO_APPROVE').length,1);
});
