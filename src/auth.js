import jwt from 'jsonwebtoken';
import { scryptSync, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors.js';
const issuer='webservice-assignment2', audience='campus-local';
export function createAuth(db,secret) {
  const publicUser=u=>({id:u.id,username:u.username,name:u.name,role:u.role});
  return {
    login(username,password) {
      const user=db.prepare('SELECT * FROM users WHERE username=?').get(username);
      if(!user || !timingSafeEqual(scryptSync(password,user.salt,64),Buffer.from(user.password_hash,'hex')))
        throw new AppError(401,'INVALID_CREDENTIALS','아이디 또는 비밀번호가 올바르지 않습니다.');
      return {accessToken:jwt.sign({},secret,{algorithm:'HS256',subject:String(user.id),issuer,audience,expiresIn:'30m'}),user:publicUser(user)};
    },
    middleware(req,res,next) {
      const header=req.get('Authorization')||'';
      if(!header.startsWith('Bearer ')) return next(new AppError(401,'TOKEN_REQUIRED','로그인이 필요합니다.'));
      try {
        const payload=jwt.verify(header.slice(7),secret,{algorithms:['HS256'],issuer,audience});
        if(typeof payload!=='object'||!/^\d+$/.test(payload.sub)||typeof payload.exp!=='number') throw new Error();
        const user=db.prepare('SELECT * FROM users WHERE id=?').get(Number(payload.sub));
        if(!user) throw new Error();
        req.user=publicUser(user); next(); // 역할도 요청 본문이 아닌 DB에서 확인합니다.
      } catch(e) { next(new AppError(401,e.name==='TokenExpiredError'?'TOKEN_EXPIRED':'INVALID_TOKEN','로그인이 만료되었거나 토큰이 유효하지 않습니다.')); }
    }
  };
}
