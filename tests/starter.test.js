// 제공된 실행·인증·조회 기반 기능을 확인합니다.
// TODO 구현 전과 후에 모두 통과해야 합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';
test('기본 실행: health와 초기 행사 2개',async t=>{const f=await fixture(t);assert.equal((await f.request('/api/health')).status,200);const r=await f.request('/api/events');assert.equal(r.data.length,2);assert.equal(r.data[0].approvedCount,0);});
test('로그인: 정상 사용자, 잘못된 암호, 토큰 누락·변조',async t=>{const f=await fixture(t);assert.equal((await f.request('/api/me',{token:f.tokens.alice})).data.role,'STUDENT');assert.equal((await f.request('/api/auth/login',{method:'POST',body:{username:'alice',password:'wrong'}})).status,401);assert.equal((await f.request('/api/me')).status,401);assert.equal((await f.request('/api/me',{token:'invalid'})).status,401);});
test('조회 권한: 학생은 운영자 명단을 읽을 수 없음',async t=>{const f=await fixture(t);assert.equal((await f.request('/api/events/1/applications',{token:f.tokens.alice})).status,403);assert.equal((await f.request('/api/events/1/applications',{token:f.tokens.manager2})).status,403);assert.equal((await f.request('/api/events/1/applications',{token:f.tokens.manager1})).status,200);});
test('입력 계약: 신원·상태 위조 필드 거부, 저장 변경 없음',async t=>{const f=await fixture(t);const before=f.snapshot();for(const body of [{userId:2},{status:'APPROVED'},{role:'MANAGER'}])assert.equal((await f.request('/api/events/1/applications',{token:f.tokens.alice,method:'POST',body})).status,400);assert.deepEqual(f.snapshot(),before);});
