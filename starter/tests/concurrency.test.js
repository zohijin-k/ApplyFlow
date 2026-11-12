// 선택 심화. 한 프로세스의 동기 코드 직렬 실행만 검사하는 것을 피하려고 서버 2개를 사용합니다.
// 반복 성공은 정확성의 증명이 아닙니다. 보고서에 보호 방식과 한계를 함께 설명하세요.
import test from 'node:test';import assert from 'node:assert/strict';import { fork } from 'node:child_process';
import { mkdtempSync,rmSync } from 'node:fs';import { tmpdir } from 'node:os';import { join } from 'node:path';
import { randomBytes } from 'node:crypto';import { fileURLToPath } from 'node:url';import { openDb } from '../src/db.js';
test('선택 심화: 서버 두 개가 마지막 한 자리를 동시에 승인', {timeout:60000}, async t=>{
 const dir=mkdtempSync(join(tmpdir(),'assignment2-race-')),path=join(dir,'shared.sqlite'),secret=randomBytes(48).toString('hex'),db=openDb(path),children=[];
 t.after(async()=>{for(const p of children){if(p.exitCode===null){p.send('stop');await new Promise(r=>p.once('exit',r));}}db.close();rmSync(dir,{recursive:true,force:true});});
 async function worker(){const p=fork(fileURLToPath(new URL('./server-worker.js',import.meta.url)),[path,secret],{silent:true});children.push(p);return new Promise((resolve,reject)=>{p.once('message',m=>resolve(`http://127.0.0.1:${m.port}`));p.once('error',reject);p.once('exit',code=>reject(new Error('서버 종료 '+code)));});}
 const [a,b]=await Promise.all([worker(),worker()]);
 async function req(base,path,token,body={}){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
 const token=(await req(a,'/api/auth/login',null,{username:'manager2',password:'Classroom123!'})).data.accessToken;
 for(let i=0;i<20;i++){
  db.exec('DELETE FROM application_history; DELETE FROM applications');
  const insert=db.prepare("INSERT INTO applications(event_id,user_id,status) VALUES (2,?,'PENDING')");const x=Number(insert.run(1).lastInsertRowid),y=Number(insert.run(2).lastInsertRowid);
  const results=await Promise.all([req(a,`/api/applications/${x}/approve`,token),req(b,`/api/applications/${y}/approve`,token)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409],JSON.stringify(results));
  assert.equal(results.find(r=>r.status===409).data.code,'CAPACITY_FULL');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM applications WHERE status='APPROVED'").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM applications WHERE status='PENDING'").get().n,1);
 }
});
