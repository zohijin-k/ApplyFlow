import express from 'express';
import { fileURLToPath } from 'node:url';
import { createAuth } from './auth.js';
import { createRepository } from './repository.js';
import { createApplicationService } from './application-service.js';
import { AppError, missing, forbidden } from './errors.js';
const bad=()=>new AppError(400,'BAD_INPUT','요청 형식이 올바르지 않습니다.');
function positiveId(value) { if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value))) throw bad(); return Number(value); }
function emptyBody(req) { const b=req.body; if(b!==undefined && (!b || Array.isArray(b)||typeof b!=='object'||Object.keys(b).length)) throw bad(); }
export function createApp({db,secret,serviceFactory=createApplicationService}) {
  const app=express(),repo=createRepository(db),auth=createAuth(db,secret),service=serviceFactory(repo);
  app.disable('x-powered-by'); app.use(express.json({limit:'8kb'}));
  app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.get('/api/health',(_req,res)=>res.json({status:'ok'}));
  app.post('/api/auth/login',(req,res)=>{
    const b=req.body;
    if(!b||typeof b.username!=='string'||typeof b.password!=='string'||!b.username||b.username.length>40||!b.password||b.password.length>100||Object.keys(b).some(k=>!['username','password'].includes(k))) throw bad();
    res.json(auth.login(b.username,b.password));
  });
  app.get('/api/me',auth.middleware,(req,res)=>res.json(req.user));
  app.get('/api/events',(_req,res)=>res.json(repo.events()));
  app.get('/api/applications/mine',auth.middleware,(req,res)=>res.json(repo.mine(req.user.id)));
  app.get('/api/events/:id/applications',auth.middleware,(req,res)=>{
    const e=repo.event(positiveId(req.params.id)); if(!e) throw missing('행사');
    if(req.user.role!=='MANAGER'||e.managerId!==req.user.id) throw forbidden();
    res.json(repo.forEvent(e.id));
  });
  app.get('/api/applications/:id',auth.middleware,(req,res)=>{
    const a=repo.application(positiveId(req.params.id));if(!a)throw missing('신청');
    const e=repo.event(a.eventId);
    if(a.userId!==req.user.id && !(req.user.role==='MANAGER'&&e.managerId===req.user.id))throw forbidden();
    res.json(a);
  });
  app.get('/api/applications/:id/history',auth.middleware,(req,res)=>{
    const a=repo.application(positiveId(req.params.id));if(!a)throw missing('신청');
    const e=repo.event(a.eventId);
    if(a.userId!==req.user.id && !(req.user.role==='MANAGER'&&e.managerId===req.user.id))throw forbidden();
    res.json(repo.history(a.id));
  });
  app.post('/api/applications/:id/revoke',auth.middleware,async(req,res)=>{
    const id=positiveId(req.params.id),b=req.body;
    if(!b||typeof b.reason!=='string'||Object.keys(b).length!==1)throw bad();
    const reason=b.reason.trim();if(reason.length<5||reason.length>200)throw bad();
    res.json(await service.revoke(req.user,id,reason));
  });
  app.post('/api/events/:id/applications',auth.middleware,async(req,res)=>{
    const id=positiveId(req.params.id);emptyBody(req);
    const a=await service.apply(req.user,id);res.status(201).location(`/api/applications/${a.id}`).json(a);
  });
  for(const action of ['cancel','approve']) app.post(`/api/applications/:id/${action}`,auth.middleware,async(req,res)=>{
    const id=positiveId(req.params.id);emptyBody(req);res.json(await service[action](req.user,id));
  });
  app.use('/api',(_req,_res,next)=>next(missing('API')));
  app.use(express.static(fileURLToPath(new URL('../public',import.meta.url))));
  app.use((err,_req,res,_next)=>{
    if(err.type==='entity.parse.failed'||err.type==='entity.too.large')err=bad();
    const status=err instanceof AppError?err.status:500;
    if(status===401)res.set('WWW-Authenticate','Bearer');
    if(status===500)console.error(err.message);
    res.status(status).json({code:status===500?'INTERNAL_ERROR':err.code,message:status===500?'서버에서 처리하지 못했습니다.':err.message});
  });
  return app;
}
