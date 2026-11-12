const $=id=>document.getElementById(id);
let token='',user=null,selectedId=1,events=[],refreshVersion=0;
const labels={PENDING:'승인 대기',APPROVED:'참가 승인',CANCELLED:'대기 취소',REVOKED:'승인 취소'};
function notice(message,error=false){$('notice').textContent=message;$('notice').className=error?'error':'';}
function node(tag,text,className=''){const n=document.createElement(tag);n.textContent=text;n.className=className;return n;}
function identity(){ $('identity').textContent=user?`${user.name} · ${user.role==='STUDENT'?'학생':'운영자'}`:'로그인 전';$('logout').hidden=!user;$('login-section').hidden=!!user; }
function clearAuth(){token='';user=null;refreshVersion++;identity();$('applications').replaceChildren(node('p','로그인하면 신청 상태를 확인할 수 있습니다.','empty'));}
async function api(path,{method='GET',body,inspect=true}={}){
 const requestToken=token;
 let res;
 try {res=await fetch(path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});}
 catch{throw new Error('응답을 받지 못했습니다. 변경이 저장되었을 수 있으니 최신 상태를 먼저 확인하세요.');}
 const data=await res.json();
 if(inspect){$('response-meta').textContent=`${method} ${path} → HTTP ${res.status}`;const safe={...data};delete safe.accessToken;$('response-body').textContent=JSON.stringify(Array.isArray(data)?data:safe,null,2);}
 if(res.status===401&&requestToken===token)clearAuth();
 if(!res.ok)throw new Error(`${res.status} ${data.code}: ${data.message}`);
 return data;
}
function renderEvents(){
 $('events').replaceChildren(...events.map(e=>{
  const card=node('article','','event'+(e.id===selectedId?' selected':''));
  card.append(node('h3',e.title),node('p',e.description));
  const row=node('div','','row');row.append(node('span',`승인 ${e.approvedCount} / 정원 ${e.capacity}명`,'capacity'));
  const b=node('button',e.id===selectedId?'선택됨':'행사 선택','quiet');b.onclick=()=>{selectedId=e.id;refresh().catch(e=>notice(e.message,true));};row.append(b);card.append(row);return card;
 }));
}
async function action(button,path,body={}){
 button.disabled=true;const oldUser=user?.id;
 try{await api(path,{method:'POST',body});if(user?.id===oldUser)notice('처리가 완료되었습니다. 현재 저장 결과를 표시합니다.');}
 catch(e){if(user?.id===oldUser||!user)notice(e.message,true);}
 finally{if(user?.id===oldUser){try{await refresh();}catch(e){notice(e.message,true);}}button.disabled=false;}
}
async function refresh(){
 const revision=++refreshVersion,who=user,eventId=selectedId;
 const list=await api('/api/events',{inspect:false});if(revision!==refreshVersion)return;events=list;renderEvents();
 const event=events.find(e=>e.id===eventId);$('selected-title').textContent=event?.title||'행사 없음';
 $('list-label').textContent=who?.role==='MANAGER'?'운영자 신청 관리':'내 신청';
 if(!who){$('list-help').textContent='로그인하면 신청 상태를 확인할 수 있습니다.';$('applications').replaceChildren();return;}
 if(who.role==='MANAGER'&&event?.managerId!==who.id){$('list-help').textContent='담당 운영자만 신청 명단을 볼 수 있습니다.';$('applications').replaceChildren();return;}
 $('list-help').textContent=who.role==='STUDENT'?'대기 중인 자신의 신청만 취소할 수 있습니다.':'승인 취소 시 가장 먼저 대기한 1명을 자동 승인합니다. 다른 탭의 변경은 새로고침하세요.';
 const apps=await api(who.role==='MANAGER'?`/api/events/${eventId}/applications`:'/api/applications/mine',{inspect:false});if(revision!==refreshVersion)return;
 const chosen=apps.filter(a=>a.eventId===eventId),content=[];
 if(!chosen.length){content.push(node('p',who.role==='STUDENT'?'아직 신청하지 않은 행사입니다.':'아직 신청자가 없습니다.','empty'));
  if(who.role==='STUDENT'){const b=node('button','참가 신청');b.onclick=()=>action(b,`/api/events/${eventId}/applications`);content.push(b);}
 }
 for(const a of chosen){const box=node('article','','app-row'),row=node('div','','row');row.append(node('strong',`${a.applicantName} · #${a.id}`),node('span',labels[a.status]||a.status,'status '+a.status));box.append(row,node('p',`신청일 ${new Date(a.createdAt).toLocaleString('ko-KR')}`));
  if(a.status==='PENDING'){const act=who.role==='MANAGER'?'approve':'cancel',b=node('button',act==='approve'?'참가 승인':'신청 취소',act==='cancel'?'danger':'');b.onclick=()=>action(b,`/api/applications/${a.id}/${act}`);box.append(b);}
  if(a.status==='APPROVED'&&who.role==='MANAGER'){
   const label=node('label','승인 취소 사유 (앞뒤 공백 제거 후 5~200자)');
   const input=document.createElement('input');input.type='text';input.maxLength=200;input.placeholder='예: 행사 운영 사정으로 승인 취소';label.append(input);
   const b=node('button','승인 취소 및 다음 대기자 승급','danger');
   b.onclick=()=>action(b,`/api/applications/${a.id}/revoke`,{reason:input.value});box.append(label,b);
  }
  const historyButton=node('button','변경 이력 보기','quiet'),historyBox=node('div','','history');
  historyButton.onclick=async()=>{
   const version=refreshVersion;historyButton.disabled=true;
   try{const rows=await api(`/api/applications/${a.id}/history`);if(version!==refreshVersion)return;
    historyBox.replaceChildren(...rows.map(h=>node('p',`#${h.id} ${h.action} · ${h.fromStatus||'없음'} → ${h.toStatus} · 행위자 #${h.actorId}`+
     (h.reason?` · 사유: ${h.reason}`:'')+(h.causeHistoryId?` · 원인 이력 #${h.causeHistoryId}`:'')+` · ${h.createdAt}`)));
    if(!rows.length)historyBox.append(node('p','저장된 변경 이력이 없습니다.'));
   }catch(e){notice(e.message,true);}finally{historyButton.disabled=false;}
  };box.append(historyButton,historyBox);
  content.push(box);
 }
 $('applications').replaceChildren(...content);
}
$('login-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const r=await api('/api/auth/login',{method:'POST',body:{username:$('username').value,password:$('password').value}});token=r.accessToken;user=r.user;identity();notice(`${user.name}님으로 로그인했습니다.`);await refresh();}catch(e){notice(e.message,true);}finally{b.disabled=false;}};
$('logout').onclick=()=>{clearAuth();notice('로그아웃했습니다.');refresh().catch(e=>notice(e.message,true));};
$('refresh').onclick=()=>refresh().then(()=>notice('현재 저장 상태를 다시 불러왔습니다.')).catch(e=>notice(e.message,true));
for(const b of document.querySelectorAll('[data-user]'))b.onclick=()=>{$('username').value=b.dataset.user;$('password').value='Classroom123!';};
identity();refresh().catch(e=>notice(e.message,true));
