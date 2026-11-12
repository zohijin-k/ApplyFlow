import { createInterface } from 'node:readline/promises';
import { stdin,stdout } from 'node:process';
import { rmSync,existsSync,statSync } from 'node:fs';
import { defaultDbPath,openDb } from '../src/db.js';
const dbPath=process.env.DB_PATH||defaultDbPath;
const prompt=createInterface({input:stdin,output:stdout});
console.log('서버를 먼저 종료하세요. 아래 로컬 DB의 신청 기록을 지우고 테스트 계정·행사를 다시 만듭니다.');console.log(dbPath);
const answer=await prompt.question('계속하려면 RESET 입력: ');prompt.close();
if(answer!=='RESET'){console.log('취소했습니다.');process.exit(0);}
// 디렉터리 재귀 삭제는 하지 않습니다. 지정한 SQLite 파일만 대상으로 합니다.
if(existsSync(dbPath)&&!statSync(dbPath).isFile())throw new Error('DB_PATH는 파일이어야 합니다.');
for(const suffix of ['','-wal','-shm'])rmSync(dbPath+suffix,{force:true});
const db=openDb(dbPath);db.close();console.log('초기화 완료. npm start로 실행하세요.');
