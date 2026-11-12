import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
export async function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'assignment2-test-')),path=join(dir,'test.sqlite'),db=openDb(path);
  const server=createApp({db,secret:randomBytes(48).toString('hex')}).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;let closed=false;
  async function stop(){if(closed)return;closed=true;await new Promise(r=>server.close(r));db.close();}
  t.after(async()=>{await stop();rmSync(dir,{recursive:true,force:true});});
  async function request(path,{token,method='GET',body}={}){
    const r=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    return {status:r.status,data:await r.json(),location:r.headers.get('location')};
  }
  const tokens={};for(const name of ['alice','bob','charlie','manager1','manager2'])tokens[name]=(await request('/api/auth/login',{method:'POST',body:{username:name,password:'Classroom123!'}})).data.accessToken;
  return {db,path,base,stop,request,tokens,
    apply:(name,event=1)=>request(`/api/events/${event}/applications`,{token:tokens[name],method:'POST',body:{}}),
    action:(name,id,action)=>request(`/api/applications/${id}/${action}`,{token:tokens[name],method:'POST',body:{}}),
    get:(name,id)=>request(`/api/applications/${id}`,{token:tokens[name]}),
    snapshot:()=>db.prepare('SELECT * FROM applications ORDER BY id').all()
  };
}
