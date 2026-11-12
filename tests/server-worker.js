// 선택 심화용: 동일 SQLite 파일을 사용하는 별도 서버 프로세스.
import { openDb } from '../src/db.js';import { createApp } from '../src/app.js';
const db=openDb(process.argv[2]);const server=createApp({db,secret:process.argv[3]}).listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
process.on('message',m=>{if(m==='stop')server.close(()=>{db.close();process.exit(0);});});
