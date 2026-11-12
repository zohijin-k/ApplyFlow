import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';
const dataDir=fileURLToPath(new URL('../data/',import.meta.url));mkdirSync(dataDir,{recursive:true});
const keyPath=fileURLToPath(new URL('../data/jwt-secret.txt',import.meta.url));
let secret=process.env.JWT_SECRET;
if(!secret) {
  try {secret=readFileSync(keyPath,'utf8').trim();}
  catch(e) {if(e.code!=='ENOENT')throw e;secret=randomBytes(48).toString('hex');writeFileSync(keyPath,secret,{mode:0o600,flag:'wx'});}
}
if(secret.length<32)throw new Error('JWT_SECRET은 32자 이상이어야 합니다.');
const port=Number(process.env.PORT||3000);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT는 1~65535 정수여야 합니다.');
const db=openDb(process.env.DB_PATH),app=createApp({db,secret});
const server=app.listen(port,'127.0.0.1',()=>console.log(`ApplyFlow 시작: http://127.0.0.1:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
