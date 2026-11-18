/* CHAIN · constancia diaria
   GUÍA DE MANTENIMIENTO
   - Archivos: index.html (estructura) · styles.css (diseño y colores) · app.js (lógica, interfaz y pruebas) ·
     manifest.webmanifest + service-worker.js + iconos (instalable en el teléfono y funciona sin conexión).
   - Datos: localStorage, clave "chain.v1" (cambia KEY si publicas otra app en la misma cuenta de GitHub Pages, comparten dominio).
     Si el JSON guardado está dañado se aparta en "chain.v1.corrupt" y se avisa.
   - Todo lo que entra (carga local, importación, nube) pasa por deserialize() > migrate(), que valida y sanea.
   - Sincronización con cuenta: opcional y solo dentro de Claude (claude.use). En un sitio propio la app es 100 % local;
     el respaldo es Exportar/Importar en Configuración.
   - Acciones: cada control es data-act="nombre" > objeto `actions`; los campos usan data-change > objeto `changes`.
   - Pruebas: abre index.html#test (no tocan tus datos).
   - Actualizar el sitio: sube los archivos nuevos. El service worker usa red primero, así que los cambios llegan solos;
     si cambias la lista de archivos de service-worker.js, sube también el número de CACHE. */
'use strict';
/* ============ utilidades ============ */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const uid=()=>Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4);
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const ds=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const pd=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d,12)};
const addDays=(s,n)=>{const d=pd(s);d.setDate(d.getDate()+n);return ds(d)};
const diffDays=(a,b)=>Math.round((pd(b)-pd(a))/864e5);
const wd=s=>(pd(s).getDay()+6)%7;
const todayS=()=>ds(new Date());
const MES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIA=['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];
const DIA1=['L','M','X','J','V','S','D'];
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const dnum=s=>+s.slice(8);
const fmtLong=s=>cap(DIA[wd(s)])+' '+dnum(s)+' de '+MES[+s.slice(5,7)-1];
const fmtShort=s=>dnum(s)+' '+MES[+s.slice(5,7)-1].slice(0,3);
const fmtDT=ts=>{const d=new Date(ts);return d.getDate()+' '+MES[d.getMonth()].slice(0,3)+' '+d.getFullYear()+', '+pad(d.getHours())+':'+pad(d.getMinutes())};
const toLocalInput=ts=>{const d=new Date(ts);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())};
const pc=x=>x==null?'—':Math.round(x*100)+'%';
const pick=a=>a[Math.floor(Math.random()*a.length)];
const dur=ms=>{const s=Math.floor(Math.max(0,ms)/1000);return{d:Math.floor(s/86400),h:Math.floor(s%86400/3600),m:Math.floor(s%3600/60),s:s%60}};
const reduced=()=>window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;

const I={
 home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
 list:'<path d="M8 6h12M8 12h12M8 18h12"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
 cal:'<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
 chart:'<path d="M5 20V10M12 20V4M19 20v-7"/>',
 gear:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 flame:'<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.2 1 2 2 2.2C10.5 8 10.8 5.5 12 3Z"/>',
 edit:'<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z"/>',
 trash:'<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
 copy:'<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
 archive:'<rect x="3.5" y="4.5" width="17" height="4.5" rx="1.5"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/>',
 up:'<path d="m6 14 6-6 6 6"/>', down:'<path d="m6 10 6 6 6-6"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
 moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
 shield:'<path d="M12 3.5 19 6v5.5c0 4.2-2.8 7.4-7 9-4.2-1.6-7-4.8-7-9V6l7-2.5Z"/>',
 x:'<path d="M6 6l12 12M18 6 6 18"/>',
 chevL:'<path d="m14.5 6-6 6 6 6"/>', chevR:'<path d="m9.5 6 6 6-6 6"/>',
 download:'<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
 upload:'<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
 target:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12h.01"/>',
 ban:'<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
 refresh:'<path d="M20 11a8 8 0 0 0-14.5-3.5M4 4v4h4M4 13a8 8 0 0 0 14.5 3.5M20 20v-4h-4"/>',
 check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>'
};
const ic=(n,c='')=>`<svg class="ic ${c}" viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;

/* ============ constantes ============ */
const COLORS=['lav','sky','mint','rose','cream','peach'];
const CNAME={lav:'Dorado',sky:'Acero',mint:'Esmeralda',rose:'Rosa',cream:'Champán',peach:'Bronce'};
const cst=k=>`--c:var(--p-${k||'lav'});--cs:var(--s-${k||'lav'})`;
const EMOJIS=['📖','🏃','🧘','💧','📝','💪','🥗','😴','🎯','✍️','🎸','🧠','🌿','☀️','🚴','🧹','💼','📚','🙏','🍎','🚭','📵','🌙','💰','🎨','🧩','☕','🦷','🛏️','🎧','🧴','🌊'];
const MILES=[7,14,21,30,60,90,365];
const AMILES=[1,3,7,14,30,60,90,180,365];
const TYPES={daily:'Diario',weekly:'Semanal',biweekly:'Quincenal',monthly:'Mensual'};
const PLEN={weekly:7,biweekly:14,monthly:30.4};
const PUNIT={weekly:'semana',biweekly:'quincena',monthly:'mes'};
const PUNITS={weekly:'sem.',biweekly:'quinc.',monthly:'mes.'};
const DEFAULT_QUOTES=['La constancia le gana a la perfección.','Un día imperfecto también suma.','Pequeños pasos, todos los días.','Si la cadena se corta, empiezas otra. Eso también es constancia.','Tu yo de mañana te lo va a agradecer.','Hecho es mejor que perfecto.','Cada eslabón cuenta.'];
const DAYDONE=['Día completo. Bien hecho.','Todo hecho por hoy. Descansa tranquilo.','Cadena intacta. Buen trabajo.'];
const EPOCH='2024-01-01';

/* ============ estado y persistencia ============ */
const KEY='chain.v1';
let S, memo={};
const bust=()=>{memo={}};
function blank(){return{v:1,updatedAt:0,demo:false,
 settings:{name:'',theme:'system',showQuote:true,quote:'',quotes:DEFAULT_QUOTES.slice(),grace:true,graceMonthly:2,gamify:true},
 cats:[{id:'c1',name:'Cuerpo'},{id:'c2',name:'Mente'},{id:'c3',name:'Trabajo'}],
 habits:[],logs:{},adds:[],goals:[],badges:{},cel:{}}}
function migrate(o){const d=blank();const s=Object.assign({},d,o);s.settings=Object.assign({},d.settings,o.settings||{});
 ['habits','adds','goals','cats'].forEach(k=>{if(!Array.isArray(s[k]))s[k]=d[k]});
 /* sanea: descarta entradas inválidas en vez de romper la app más tarde */
 const objId=x=>x&&typeof x==='object'&&typeof x.id==='string'&&x.id;
 s.habits=s.habits.filter(objId);s.goals=s.goals.filter(objId);s.cats=s.cats.filter(objId);
 s.adds=s.adds.filter(a=>objId(a)&&Number.isFinite(a.origin||a.start));
 s.habits.forEach(h=>{h.name=String(h.name==null?'Hábito':h.name)});
 if(!['light','dark','system'].includes(s.settings.theme))s.settings.theme='system';
 if(!Array.isArray(s.settings.quotes))s.settings.quotes=d.settings.quotes.slice();
 s.logs=s.logs&&typeof s.logs==='object'?s.logs:{};
 {const clean={};for(const id in s.logs){const L=s.logs[id];if(!L||typeof L!=='object')continue;clean[id]={};for(const k in L)if(/^\d{4}-\d{2}-\d{2}$/.test(k)&&(L[k]===1||L[k]===2))clean[id][k]=L[k]}s.logs=clean}s.badges=s.badges||{};s.cel=s.cel||{};
 s.habits.forEach(h=>{h.type=h.type||'daily';h.days=Array.isArray(h.days)&&h.days.length?h.days:[0,1,2,3,4,5,6];h.target=h.target||1;h.color=h.color||'lav';h.created=h.created||todayS();h.emoji=h.emoji||'🎯'});
 s.adds.forEach(a=>{a.events=a.events||[];a.origin=a.origin||a.start;a.color=a.color||'lav'});
 return s}
function packLogs(logs){const out={};for(const id in logs){const m={};for(const d in logs[id]){const k=d.slice(0,7),i=+d.slice(8)-1;(m[k]=m[k]||Array(31).fill('0'))[i]=String(logs[id][d])}for(const k in m)m[k]=m[k].join('').replace(/0+$/,'');out[id]=m}return out}
function unpackLogs(p){const out={};for(const id in p){const L=out[id]={};for(const k in p[id]){const s=p[id][k];for(let i=0;i<s.length;i++)if(s[i]!=='0')L[k+'-'+pad(i+1)]=+s[i]}}return out}
const serialize=()=>JSON.stringify(Object.assign({},S,{logs:packLogs(S.logs),lp:1}));
function deserialize(str){
 if(typeof str!=='string'||!str.trim())throw new Error('vacio');
 if(str.length>5e6)throw new Error('grande');
 let o;try{o=JSON.parse(str)}catch(e){throw new Error('json')}
 if(!o||typeof o!=='object'||!Array.isArray(o.habits))throw new Error('formato');if(o.lp)o.logs=unpackLogs(o.logs||{});delete o.lp;return migrate(o)}
/* Avisos visibles: store = no se puede escribir en el navegador; corrupt = los datos guardados estaban dañados. */
const warn={store:false,corrupt:false};
const store=()=>window.__chainStore||window.localStorage;   /* __chainStore: solo para pruebas */
function loadLocal(){
 let r=null;try{r=store().getItem(KEY)}catch(e){warn.store=true;return null}
 if(!r)return null;
 try{return deserialize(r)}catch(e){warn.corrupt=true;try{store().setItem(KEY+'.corrupt',r)}catch(_){}return null}}
function save(){S.updatedAt=Date.now();bust();
 try{store().setItem(KEY,serialize());warn.store=false}
 catch(e){if(!warn.store){warn.store=true;toast('No se pudo guardar en este dispositivo. Exporta una copia.');render()}}
 scheduleRemote()}

/* ---- sincronización con la cuenta (capacidad db, opcional) ---- */
const remote={doc:null,status:'local',timer:null,busy:false,dirty:false};
function scheduleRemote(){if(!remote.doc)return;remote.dirty=true;clearTimeout(remote.timer);remote.timer=setTimeout(pushRemote,1400)}
async function pushRemote(){
 if(!remote.doc||remote.busy||!remote.dirty)return;remote.busy=true;remote.dirty=false;remote.status='syncing';paintFoot();
 let failed=false;
 try{const json=serialize();if(json.length>240000){remote.status='big';remote.busy=false;paintFoot();return}
  await remote.doc.set({json,updatedAt:S.updatedAt});remote.status='sync';remote.retry=0}
 catch(e){failed=true;remote.status='err';remote.retry=(remote.retry||0)+1}
 remote.busy=false;paintFoot();
 /* si falla, reintenta con espera creciente (8, 16, 32, 60 s) y se rinde tras 4 intentos; el siguiente cambio vuelve a intentarlo */
 if(failed){if(remote.retry<=4){remote.dirty=true;clearTimeout(remote.timer);remote.timer=setTimeout(pushRemote,Math.min(60000,4000*2**remote.retry))}}
 else if(remote.dirty)scheduleRemote()}
async function initRemote(){
 try{
  if(!window.claude||!claude.use)return;
  const [db,user]=await Promise.all([claude.use('db'),claude.use('user')]);
  if(!db||!user)return;const id=await user.id();if(!id)return;
  remote.doc=db.doc('data/users/'+id+'/state');remote.status='syncing';paintFoot();
  const snap=await remote.doc.get();
  if(snap.exists){const d=snap.data()||{};let rs=null;try{rs=deserialize(d.json)}catch(e){}
   if(rs&&(rs.updatedAt||0)>(S.updatedAt||0)){S=rs;bust();try{store().setItem(KEY,serialize())}catch(e){warn.store=true}remote.status='sync';render();toast('Datos sincronizados con tu cuenta')}
   else if((S.updatedAt||0)>(d.updatedAt||0)){remote.dirty=true;await pushRemote()}
   else remote.status='sync'}
  else if((S.updatedAt||0)>0){remote.dirty=true;await pushRemote()}
  else remote.status='sync';
  paintFoot();
 }catch(e){remote.status=remote.doc?'err':'local';paintFoot()}
}

/* ============ datos derivados ============ */
const H=id=>S.habits.find(h=>h.id===id);
const activeHabits=()=>S.habits.filter(h=>!h.archived);
function periodOf(type,s){
 if(type==='weekly'){const st=addDays(s,-wd(s));return{start:st,end:addDays(st,6)}}
 if(type==='biweekly'){const n=Math.floor(diffDays(EPOCH,s)/14);const st=addDays(EPOCH,n*14);return{start:st,end:addDays(st,13)}}
 const d=pd(s);return{start:ds(new Date(d.getFullYear(),d.getMonth(),1,12)),end:ds(new Date(d.getFullYear(),d.getMonth()+1,0,12))}}
function periodCount(h,date){const p=periodOf(h.type,date);const L=S.logs[h.id]||{};let c=0;for(let d=p.start;d<=p.end;d=addDays(d,1))if(L[d])c++;return c}
function setLog(h,date,val){const L=S.logs[h.id]||(S.logs[h.id]={});if(val)L[date]=val;else delete L[date];if(date<h.created)h.created=date}
function graceUsed(month){let n=0;for(const id in S.logs)for(const d in S.logs[id])if(S.logs[id][d]===2&&d.startsWith(month))n++;return n}
const graceLeft=month=>Math.max(0,S.settings.graceMonthly-graceUsed(month));

function units(h){
 const T=todayS(),L=S.logs[h.id]||{},out=[],start=h.created<=T?h.created:T;
 if(h.type==='daily'){for(let d=start;d<=T;d=addDays(d,1))if(h.days.includes(wd(d)))out.push({s:d,e:d,done:!!L[d],open:d===T})}
 else{let p=periodOf(h.type,start);while(p.start<=T){let c=0;for(let d=p.start;d<=p.end;d=addDays(d,1))if(L[d])c++;out.push({s:p.start,e:p.end,done:c>=h.target,count:c,open:p.end>=T});p=periodOf(h.type,addDays(p.end,1))}}
 return out}
function stats(h){
 const k='s'+h.id;if(memo[k])return memo[k];
 let u=units(h);const last=u[u.length-1];
 const closed=last&&last.open&&!last.done?u.slice(0,-1):u;
 let run=0,best=0,rs=null;const runs=[];
 closed.forEach((x,i)=>{if(x.done){if(!run)rs=x;run++;best=Math.max(best,run)}else{if(run)runs.push({s:rs.s,e:closed[i-1].e,len:run});run=0}});
 if(run)runs.push({s:rs.s,e:closed[closed.length-1].e,len:run});
 const cur=closed.length&&closed[closed.length-1].done?run:0;
 let total=0;const L=S.logs[h.id]||{};for(const d in L)if(L[d]===1)total++;
 const doneN=closed.filter(x=>x.done).length;
 return memo[k]={cur,best,total,runs,units:u,rate:closed.length?doneN/closed.length:null,closedN:closed.length}}
function dayScore(date){
 const k='d'+date;if(memo[k])return memo[k];
 let tot=0,done=0,extra=0;
 for(const h of S.habits){if(h.created>date)continue;if(h.archived&&h.archivedAt&&h.archivedAt<=date)continue;
  const v=S.logs[h.id]&&S.logs[h.id][date];
  if(h.type==='daily'){if(h.days.includes(wd(date))){tot++;if(v)done++}else if(v)extra++}else if(v)extra++}
 return memo[k]=tot===0?(extra>0?{r:1,done:extra,tot:0}:{r:null,done:0,tot:0}):{r:Math.min(1,(done+extra)/tot),done:done+extra,tot}}
function firstDate(){let f=null;S.habits.forEach(h=>{if(!f||h.created<f)f=h.created});return f}
function globalStreaks(){
 if(memo.gs)return memo.gs;const T=todayS(),f=firstDate();if(!f)return memo.gs={cur:0,best:0};
 const arr=[];for(let d=f;d<=T;d=addDays(d,1))arr.push([d,dayScore(d).r]);
 let best=0,run=0;arr.forEach(([d,r])=>{if(r===null)return;if(r>=1){run++;best=Math.max(best,run)}else if(d!==T)run=0});
 let cur=0;for(let i=arr.length-1;i>=0;i--){const [d,r]=arr[i];if(r===null)continue;if(r>=1)cur++;else if(d===T)continue;else break}
 return memo.gs={cur,best}}
function avgRatio(start,end){const T=todayS();if(end>T)end=T;let s=0,n=0;for(let d=start;d<=end;d=addDays(d,1)){const r=dayScore(d).r;if(r!==null){s+=r;n++}}return n?s/n:null}
function habitRange(h,start,end){
 const T=todayS(),e=end>T?T:end;if(start>e)return null;const L=S.logs[h.id]||{};let c=0,sched=0;
 for(let d=start;d<=e;d=addDays(d,1)){if(L[d])c++;if(h.type==='daily'&&h.days.includes(wd(d))&&d>=h.created)sched++}
 if(h.type==='daily')return sched?{c,den:sched,p:Math.min(1,c/sched)}:null;
 const days=diffDays(start,e)+1,den=h.target*days/PLEN[h.type];return{c,den,p:Math.min(1,c/Math.max(den,h.target*.25))}}
function logCount(start,end){let n=0;for(const id in S.logs)for(const d in S.logs[id])if(d>=start&&d<=end&&S.logs[id][d])n++;return n}

/* hábitos a dejar */
function segments(a){const resets=a.events.filter(e=>e.type!=='desliz').sort((x,y)=>x.ts-y.ts);const segs=[];let st=a.origin;resets.forEach(e=>{segs.push({s:st,e:e.ts});st=e.ts});segs.push({s:st,e:Date.now(),open:true});return segs}
function bestMs(a){return Math.max(0,...segments(a).map(s=>s.e-s.s))}

/* nivel, XP e insignias */
function xpTotal(){let c=0;for(const id in S.logs)for(const d in S.logs[id])if(S.logs[id][d]===1)c++;let cd=0;S.adds.forEach(a=>segments(a).forEach(s=>{cd+=Math.floor((s.e-s.s)/864e5)}));return c*10+cd*5+Object.keys(S.badges).length*50}
function levelOf(xp){let L=1;while(50*(L+1)*L<=xp)L++;const T=['Primeros pasos','Constante','Firme','Sólido','Imparable','Maestro de la cadena'];return{L,base:50*L*(L-1),next:50*(L+1)*L,name:T[Math.min(5,Math.floor((L-1)/2))],xp}}
function badgeDefs(){
 const dailyBest=Math.max(0,...S.habits.filter(h=>h.type==='daily').map(h=>stats(h).best));
 const addBest=Math.max(0,...S.adds.map(a=>Math.floor(bestMs(a)/864e5)));
 let comp=0;for(const id in S.logs)for(const d in S.logs[id])if(S.logs[id][d]===1)comp++;
 let perfect=false;const f=firstDate(),T=todayS();if(f)for(let d=f;d<=T&&!perfect;d=addDays(d,1)){const s=dayScore(d);if(s.tot>=3&&s.r>=1)perfect=true}
 const out=[];
 MILES.forEach(n=>out.push({id:'h'+n,n,sub:'días de cadena',name:n+' días',earned:dailyBest>=n,tone:'lav'}));
 MILES.forEach(n=>out.push({id:'a'+n,n,sub:'días libre',name:'Libre '+n+'d',earned:addBest>=n,tone:'mint'}));
 out.push({id:'first',n:'1',sub:'primer eslabón',name:'Primer paso',earned:comp>=1,tone:'sky'});
 out.push({id:'c100',n:'100',sub:'completados',name:'100 hechos',earned:comp>=100,tone:'sky'});
 out.push({id:'c500',n:'500',sub:'completados',name:'500 hechos',earned:comp>=500,tone:'sky'});
 out.push({id:'perfect',n:'★',sub:'día perfecto',name:'Día perfecto',earned:perfect,tone:'cream'});
 return out}
function checkBadges(celebrate){
 const defs=badgeDefs();const nw=[];defs.forEach(b=>{if(b.earned&&!S.badges[b.id]){S.badges[b.id]=todayS();nw.push(b)}});
 if(nw.length&&celebrate&&S.settings.gamify){toast('Nueva insignia: '+nw[0].name);confetti()}
 return nw.length>0}
/* ============ interfaz: estado visual ============ */
const ui={view:'home',tab:'habits',cal:{mode:'week',anchor:todayS(),sel:todayS()},cat:'all',showArch:false,just:null,ringPrev:null,lastView:null,today:todayS(),qoff:0,form:{},sheet:null};
const isDark=()=>S.settings.theme==='dark'||(S.settings.theme==='system'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches);
function applyTheme(){const t=S.settings.theme,r=document.documentElement;if(t==='system')r.removeAttribute('data-theme');else r.setAttribute('data-theme',t);const m=document.querySelector('meta[name=theme-color]');if(m)m.content=isDark()?'#0B0A08':'#FBF8F0'}
let toastT;function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),2600)}
function confetti(n=70){
 if(reduced())return;const cv=$('#confetti');if(!cv.getContext)return;const ctx=cv.getContext('2d');if(!ctx)return;
 const w=cv.width=innerWidth,h=cv.height=innerHeight;const cols=['#E6C766','#D4AF37','#F0D98A','#C29A2E','#F3EBD8','#B8860B'];
 const ps=Array.from({length:n},()=>({x:w/2+(Math.random()-.5)*w*.3,y:h*.62,vx:(Math.random()-.5)*9,vy:-Math.random()*11-4,s:Math.random()*6+4,r:Math.random()*6,vr:(Math.random()-.5)*.3,c:cols[Math.floor(Math.random()*cols.length)],l:1}));
 let f=0;(function step(){ctx.clearRect(0,0,w,h);ps.forEach(p=>{p.vy+=.32;p.x+=p.vx;p.y+=p.vy;p.vx*=.99;p.r+=p.vr;p.l=Math.max(0,1-f/70);ctx.save();ctx.globalAlpha=p.l;ctx.translate(p.x,p.y);ctx.rotate(p.r);ctx.fillStyle=p.c;ctx.fillRect(-p.s/2,-p.s/3,p.s,p.s*.6);ctx.restore()});if(++f<75)requestAnimationFrame(step);else ctx.clearRect(0,0,w,h)})()}

const NAV=[['home','Hoy','Hoy','home'],['habits','Mis hábitos','Hábitos','list'],['calendar','Calendario','Calendario','cal'],['stats','Estadísticas','Stats','chart'],['settings','Configuración','Ajustes','gear']];
const head=(eb,title,acts='')=>`<header class="top"><div><p class="eyebrow">${eb}</p><h1>${title}</h1></div><div class="top-act">${acts}</div></header>`;
const lvl=r=>r==null||r<=0?0:r<.34?1:r<.67?2:r<1?3:4;
const A=id=>S.adds.find(a=>a.id===id);
function metaOf(h){let t;if(h.type==='daily')t=h.days.length===7?'Todos los días':(h.days.length===5&&!h.days.includes(5)&&!h.days.includes(6))?'Lunes a viernes':h.days.map(i=>DIA1[i]).join(' ');else t=h.target+'× por '+PUNIT[h.type];if(h.time)t+=' · '+h.time;const c=S.cats.find(c=>c.id===h.cat);if(c)t+=' · '+c.name;return t}
function dots7(h){const T=todayS();let s='';for(let i=6;i>=0;i--){const d=addDays(T,-i);s+=`<i class="${S.logs[h.id]&&S.logs[h.id][d]?'on':''}"></i>`}return`<div class="dots" aria-hidden="true">${s}</div>`}
function habitCard(h){
 const T=todayS(),st=stats(h),done=!!(S.logs[h.id]&&S.logs[h.id][T]);let sub,prog;
 if(h.type==='daily'){sub=esc(h.desc||metaOf(h));prog=dots7(h)}
 else{const c=periodCount(h,T);sub=`${c} de ${h.target} esta ${PUNIT[h.type]}`;prog=`<div class="bar sm"><i style="width:${Math.min(100,c/h.target*100)}%"></i></div>`}
 return`<article class="hc ${done?'done':''} ${ui.just===h.id?'just':''}" style="${cst(h.color)}" data-act="openHabit" data-id="${h.id}" role="button" tabindex="0">
 <button class="chk" data-act="toggle" data-id="${h.id}" aria-pressed="${done}" aria-label="${done?'Desmarcar':'Completar'} ${esc(h.name)}"><svg viewBox="0 0 24 24"><path class="tick" d="m5 12.5 4.5 4.5L19 7.5"/></svg></button>
 <div class="hc-em">${esc(h.emoji)}</div>
 <div class="hc-body"><h3>${esc(h.name)}</h3><p>${sub}</p>${prog}</div>
 <div class="hc-side">${st.cur>0?`<span class="streak">${ic('flame')}${st.cur}</span>`:''}${h.time?`<span>${esc(h.time)}</span>`:''}</div></article>`}
function monthCells(y,m){const first=ds(new Date(y,m,1,12)),n=new Date(y,m+1,0).getDate(),off=wd(first),out=[];for(let i=0;i<off;i++)out.push(null);for(let d=1;d<=n;d++)out.push(ds(new Date(y,m,d,12)));return out}
function miniMonth(){
 const T=todayS(),d=pd(T);let h='<div class="mini-cal">'+DIA1.map(x=>`<span class="wh">${x}</span>`).join('');
 monthCells(d.getFullYear(),d.getMonth()).forEach(s=>{if(!s){h+='<span class="mc blank"></span>';return}const r=dayScore(s).r;h+=`<button class="mc l${lvl(r)}${s===T?' today':''}" ${s>T?'disabled':''} data-act="goDay" data-d="${s}" aria-label="${fmtLong(s)}${r!=null?': '+pc(r):''}">${dnum(s)}</button>`});
 return h+'</div><div class="legend">Menos<i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i>Más</div>'}
function quoteText(){if(S.settings.quote)return S.settings.quote;const q=S.settings.quotes.filter(Boolean);if(!q.length)return'';const doy=Math.floor((pd(todayS())-new Date(new Date().getFullYear(),0,0,12))/864e5);return q[(doy+ui.qoff)%q.length]}
function liveText(ms){const t=dur(ms);return`${t.d} d ${pad(t.h)} h ${pad(t.m)} min`}
function liveBox(start){const t=dur(Date.now()-start);return`<div class="clock" data-live="${start}" data-f="box"><div><b data-u="d">${t.d}</b><span>días</span></div><div><b data-u="h">${pad(t.h)}</b><span>horas</span></div><div><b data-u="m">${pad(t.m)}</b><span>min</span></div><div><b data-u="s">${pad(t.s)}</b><span>seg</span></div></div>`}
function tick(){const now=Date.now();$$('[data-live]').forEach(el=>{const ms=Math.max(0,now-(+el.dataset.live)),t=dur(ms);if(el.dataset.f==='box'){const q=u=>el.querySelector('[data-u="'+u+'"]');q('d').textContent=t.d;q('h').textContent=pad(t.h);q('m').textContent=pad(t.m);q('s').textContent=pad(t.s)}else el.textContent=liveText(ms)})}

/* ---------- Hoy ---------- */
function vHome(){
 const T=todayS(),hs=activeHabits(),name=S.settings.name.trim();
 const daily=hs.filter(h=>h.type==='daily'&&h.days.includes(wd(T))),per=hs.filter(h=>h.type!=='daily');
 const dn=daily.filter(h=>S.logs[h.id]&&S.logs[h.id][T]),pend=daily.filter(h=>!(S.logs[h.id]&&S.logs[h.id][T]));
 const pct=daily.length?Math.round(dn.length/daily.length*100):0,gs=globalStreaks();
 const hr=new Date().getHours(),g=hr<6?'Buenas noches':hr<13?'Buenos días':hr<20?'Buenas tardes':'Buenas noches';
 const C=326.73,to=C*(1-pct/100),from=ui.ringPrev==null?C:ui.ringPrev;
 const msg=!daily.length?'Hoy no tienes hábitos programados.':pct===100?'Todo hecho por hoy. Descansa tranquilo.':pct>=50?'Más de la mitad. Vas muy bien.':pct>0?'Buen comienzo. Un eslabón a la vez.':'Un buen día empieza con un solo hábito.';
 let h=head(fmtLong(T),esc(g)+(name?`, <em>${esc(name)}</em>`:''),`<button class="btn pri" data-act="newHabit">${ic('plus')}Crear hábito</button><button class="icon-btn" data-act="themeToggle" aria-label="Cambiar tema">${ic(isDark()?'sun':'moon')}</button>`);
 if(!hs.length&&!S.adds.length){
  h+=`<div class="card empty"><b>Empieza tu cadena</b><p>Crea tu primer hábito o elige uno de estos para empezar hoy mismo.</p>
  <div class="chips" style="justify-content:center"><button class="chip" data-act="quickAdd" data-k="water">💧 Beber agua</button><button class="chip" data-act="quickAdd" data-k="read">📖 Leer 20 min</button><button class="chip" data-act="quickAdd" data-k="move">🏃 Moverme</button><button class="chip" data-act="quickAdd" data-k="calm">🧘 Meditar</button></div>
  <button class="btn pri" data-act="newHabit">${ic('plus')}Crear hábito</button></div>`;return h}
 h+=`<div class="cols"><div class="stack">
 <section class="card hero"><div class="ringwrap"><svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--s-lav)"/><stop offset="1" style="stop-color:var(--s-cream)"/></linearGradient></defs><circle class="rb" cx="60" cy="60" r="52"/><circle class="rf" id="ringfg" cx="60" cy="60" r="52" style="stroke-dasharray:${C};stroke-dashoffset:${from}" data-to="${to}"/></svg><div class="ring-c"><b>${pct}<small>%</small></b><span>del día</span></div></div>
 <div><div class="kpis"><div class="kpi"><b>${dn.length}</b><span>Completados</span></div><div class="kpi"><b>${pend.length}</b><span>Pendientes</span></div><div class="kpi"><b>${gs.cur}</b><span>Racha actual</span></div><div class="kpi"><b>${gs.best}</b><span>Mejor racha</span></div></div><p class="hero-msg">${msg}</p></div></section>
 <div><div class="sec-h" style="margin-top:6px"><h2>Mi enfoque de hoy</h2><small>${pend.length?pend.length+(pend.length===1?' pendiente':' pendientes'):'Todo al día'}</small></div>
 <div class="hlist">${pend.map(habitCard).join('')}${dn.length?`<p class="lbl-row" style="margin-bottom:0">Completados</p>`+dn.map(habitCard).join(''):''}</div>
 ${!daily.length?'<div class="card soft muted small">Hoy descansan tus hábitos diarios. Disfruta el día.</div>':''}
 ${per.length?`<p class="lbl-row" style="margin-top:20px">Metas del período</p><div class="hlist">${per.map(habitCard).join('')}</div>`:''}</div>
 </div><div class="stack">`;
 if(S.settings.showQuote&&quoteText())h+=`<section class="card quote-card"><p class="quote">“${esc(quoteText())}”</p><div class="row"><button class="btn sm" data-act="editQuote">${ic('edit')}Editar</button><button class="btn sm" data-act="nextQuote">${ic('refresh')}Otra</button></div></section>`;
 const d=pd(T);
 h+=`<section class="card"><div class="sec-h" style="margin:0 0 12px"><h2>${cap(MES[d.getMonth()])}</h2><small>Consistencia diaria</small></div>${miniMonth()}</section>`;
 const act=S.adds.filter(a=>!a.archived);
 h+=`<section class="card"><div class="sec-h" style="margin:0 0 8px"><h2>Breaking Bad Habits</h2><button class="btn sm" data-act="goBreak">Ver todo</button></div>`+(act.length?act.map(a=>`<button class="drow" style="width:100%;text-align:left;${cst(a.color)}" data-act="openAdd" data-id="${a.id}"><span class="hc-em" style="width:38px;height:38px;font-size:18px">${esc(a.emoji)}</span><span class="nm">${esc(a.name)}</span><b class="small muted" data-live="${a.start}" style="font-variant-numeric:tabular-nums">${liveText(Date.now()-a.start)}</b></button>`).join(''):`<p class="muted small">Registra un hábito que quieras dejar y sigue su contador en vivo.</p><button class="btn sm" style="margin-top:10px" data-act="newAdd">${ic('plus')}Agregar</button>`)+`</section>`;
 if(S.settings.gamify){const lv=levelOf(xpTotal());h+=`<section class="card lvl"><div class="t"><b>Nivel ${lv.L} · ${lv.name}</b><span class="small muted">${lv.xp-lv.base} / ${lv.next-lv.base} XP</span></div><div class="bar"><i style="width:${(lv.xp-lv.base)/(lv.next-lv.base)*100}%"></i></div></section>`}
 return h+'</div></div>'}

/* ---------- Hábitos ---------- */
function vHabits(){
 const acts={habits:`<button class="btn pri" data-act="newHabit">${ic('plus')}Nuevo</button>`,break:`<button class="btn pri" data-act="newAdd">${ic('plus')}Nuevo</button>`,goals:`<button class="btn pri" data-act="newGoal">${ic('plus')}Nueva</button>`};
 let h=head('Tu sistema','Mis hábitos',acts[ui.tab]);
 h+=`<div class="seg" role="tablist"><button class="${ui.tab==='habits'?'on':''}" data-act="tab" data-t="habits">Hábitos</button><button class="${ui.tab==='break'?'on':''}" data-act="tab" data-t="break">Breaking Bad Habits</button><button class="${ui.tab==='goals'?'on':''}" data-act="tab" data-t="goals">Metas</button></div><div style="height:18px"></div>`;
 if(ui.tab==='habits'){
  const list=S.habits.filter(x=>!x.archived&&(ui.cat==='all'||x.cat===ui.cat));
  h+=`<div class="chips" style="margin-bottom:16px"><button class="chip ${ui.cat==='all'?'on':''}" data-act="cat" data-c="all">Todos</button>${S.cats.map(c=>`<button class="chip ${ui.cat===c.id?'on':''}" data-act="cat" data-c="${c.id}">${esc(c.name)}</button>`).join('')}<button class="chip" data-act="newCat" aria-label="Nueva categoría">+ Categoría</button></div>`;
  h+=list.length?`<div class="hlist">${list.map((x,i)=>`<div class="hrow" style="${cst(x.color)}"><button class="hrow-main" data-act="openHabit" data-id="${x.id}"><span class="em">${esc(x.emoji)}</span><span style="min-width:0"><b>${esc(x.name)}</b><small>${esc(metaOf(x))}${stats(x).cur?' · 🔥 '+stats(x).cur:''}</small></span></button><div class="hrow-act"><button class="icon-btn sm" data-act="mv" data-id="${x.id}" data-dir="-1" ${i===0?'disabled':''} aria-label="Subir">${ic('up')}</button><button class="icon-btn sm" data-act="mv" data-id="${x.id}" data-dir="1" ${i===list.length-1?'disabled':''} aria-label="Bajar">${ic('down')}</button></div></div>`).join('')}</div>`
   :`<div class="card empty"><b>${S.habits.some(x=>!x.archived)?'Sin hábitos en esta categoría':'Todavía no tienes hábitos'}</b><p>Crea uno y márcalo cada día para construir tu cadena.</p><button class="btn pri" data-act="newHabit">${ic('plus')}Crear hábito</button></div>`;
  const arch=S.habits.filter(x=>x.archived);
  if(arch.length){h+=`<div class="sec-h"><h2>Archivados</h2><button class="btn sm" data-act="toggleArch">${ui.showArch?'Ocultar':'Mostrar ('+arch.length+')'}</button></div>`;
   if(ui.showArch)h+=`<div class="hlist">${arch.map(x=>`<div class="hrow arch" style="${cst(x.color)}"><button class="hrow-main" data-act="openHabit" data-id="${x.id}"><span class="em">${esc(x.emoji)}</span><span style="min-width:0"><b>${esc(x.name)}</b><small>${stats(x).total} días registrados</small></span></button><button class="btn sm" data-act="restore" data-id="${x.id}">Restaurar</button></div>`).join('')}</div>`}
 }else if(ui.tab==='break'){
  const act=S.adds.filter(a=>!a.archived);
  h+=`<p class="muted small" style="margin-bottom:14px;max-width:560px">Un contador en vivo desde tu último episodio. Si hay una recaída, tu récord se conserva y empiezas otra racha, sin culpa.</p>`;
  h+=act.length?`<div class="cols2" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))">${act.map(a=>{const ms=Date.now()-a.start,nx=AMILES.find(n=>n*864e5>ms),pv=[0].concat(AMILES).filter(n=>n*864e5<=ms).pop(),pr=nx?(ms-pv*864e5)/((nx-pv)*864e5):1;
   return`<button class="bc" style="${cst(a.color)}" data-act="openAdd" data-id="${a.id}"><div class="bc-h"><span class="em">${esc(a.emoji)}</span><div style="min-width:0"><b>${esc(a.name)}</b><small class="muted">Récord: ${Math.floor(Math.max(bestMs(a),ms)/864e5)} días</small></div></div><div class="live-s" data-live="${a.start}">${liveText(ms)}</div><div><div class="bar"><i style="width:${Math.min(100,pr*100)}%"></i></div><small class="muted">${nx?'Próxima meta: '+nx+(nx===1?' día':' días'):'Todas las metas cumplidas'}</small></div></button>`}).join('')}</div>`
   :`<div class="card empty"><b>Nada que dejar por ahora</b><p>Agrega un hábito que quieras soltar: fumar, alcohol, redes, procrastinar o lo que sea tuyo.</p><button class="btn pri" data-act="newAdd">${ic('plus')}Agregar</button></div>`;
  const ar=S.adds.filter(a=>a.archived);if(ar.length)h+=`<div class="sec-h"><h2>Archivados</h2></div><div class="hlist">${ar.map(a=>`<div class="hrow arch" style="${cst(a.color)}"><button class="hrow-main" data-act="openAdd" data-id="${a.id}"><span class="em">${esc(a.emoji)}</span><span><b>${esc(a.name)}</b></span></button></div>`).join('')}</div>`;
 }else{
  h+=S.goals.length?`<div class="hlist">${S.goals.map(g=>{const p=clamp(g.current/g.target,0,1);return`<div class="card" style="${cst(g.color||'lav')}"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div style="min-width:0"><h3>${esc(g.title)}</h3><small class="muted">${esc(String(g.current))} de ${esc(String(g.target))} ${esc(g.unit||'')}${g.due?' · hasta '+fmtShort(g.due):''}</small></div><b style="font-family:var(--serif);font-size:26px;font-weight:500">${Math.round(p*100)}%</b></div><div class="bar" style="margin:12px 0"><i style="width:${p*100}%"></i></div><div class="row"><button class="btn sm" data-act="goalStep" data-id="${g.id}" data-n="-1">−1</button><button class="btn sm pri" data-act="goalStep" data-id="${g.id}" data-n="1">+1</button><span class="grow"></span><button class="icon-btn sm" data-act="editGoal" data-id="${g.id}" aria-label="Editar">${ic('edit')}</button></div></div>`}).join('')}</div>`
   :`<div class="card empty"><b>Metas de largo plazo</b><p>Define algo grande (12 libros, 100 km, 10.000 pasos por semana) y avanza paso a paso.</p><button class="btn pri" data-act="newGoal">${ic('plus')}Crear meta</button></div>`;
 }
 return h}

/* ---------- Calendario ---------- */
function calRange(){const m=ui.cal.mode,t=m==='week'?'weekly':m==='fort'?'biweekly':'monthly';return Object.assign({t},periodOf(t,ui.cal.anchor))}
function habitsFor(R){return S.habits.filter(h=>h.created<=R.end&&(!h.archived||(h.archivedAt&&h.archivedAt>R.start)))}
function cellBtn(h,d,T){const v=(S.logs[h.id]&&S.logs[h.id][d])||0,off=h.type==='daily'&&!h.days.includes(wd(d));return`<button class="cell s${v}${off?' off':''}" ${d>T?'disabled':''} data-act="cell" data-id="${h.id}" data-d="${d}" aria-label="${esc(h.name)}, ${fmtShort(d)}: ${v===1?'hecho':v===2?'comodín':'pendiente'}"></button>`}
function vCal(){
 const T=todayS(),R=calRange(),prev=periodOf(R.t,addDays(R.start,-1)),mode=ui.cal.mode;
 const cur=avgRatio(R.start,R.end),pv=avgRatio(prev.start,prev.end),delta=cur!=null&&pv!=null?Math.round((cur-pv)*100):null;
 const label=mode==='month'?cap(MES[+R.start.slice(5,7)-1])+' '+R.start.slice(0,4):fmtShort(R.start)+' – '+fmtShort(R.end)+' '+R.end.slice(0,4);
 const hs=habitsFor(R);
 let h=head('Tu historial','Calendario',`<button class="btn" data-act="calToday">Hoy</button>`);
 h+=`<div class="row" style="justify-content:space-between;margin-bottom:16px"><div class="seg"><button class="${mode==='week'?'on':''}" data-act="calMode" data-m="week">Semanal</button><button class="${mode==='fort'?'on':''}" data-act="calMode" data-m="fort">Quincenal</button><button class="${mode==='month'?'on':''}" data-act="calMode" data-m="month">Mensual</button></div>
 <div class="row" style="gap:6px"><button class="icon-btn" data-act="calNav" data-dir="-1" aria-label="Período anterior">${ic('chevL')}</button><b style="min-width:150px;text-align:center">${label}</b><button class="icon-btn" data-act="calNav" data-dir="1" ${R.end>=T?'disabled':''} aria-label="Período siguiente">${ic('chevR')}</button></div></div>`;
 h+=`<section class="card"><div class="sumrow"><div><b>${pc(cur)}${delta!=null?`<span class="delta ${delta>=0?'up':'dn'}">${delta>=0?'+':''}${delta} pts</span>`:''}</b><span>Cumplimiento</span></div><div><b>${logCount(R.start,R.end)}</b><span>Hábitos completados</span></div><div><b>${pc(pv)}</b><span>Período anterior</span></div></div>`;
 if(!hs.length)h+=`<div class="empty"><b>Sin hábitos en este período</b><p>Crea un hábito para ver tu calendario.</p></div>`;
 else if(mode!=='month'){
  const days=[];for(let d=R.start;d<=R.end;d=addDays(d,1))days.push(d);
  h+=`<div class="gridwrap"><table class="gtab"><thead><tr><th class="hn"></th>${days.map(d=>`<th class="${d===T?'today':''}">${DIA1[wd(d)]}<b>${dnum(d)}</b></th>`).join('')}<th></th></tr></thead><tbody>`+hs.map(x=>{const r=habitRange(x,R.start,R.end);return`<tr style="${cst(x.color)}"><td class="hn"><div class="hn-in"><span class="e">${esc(x.emoji)}</span>${esc(x.name)}</div></td>${days.map(d=>`<td>${cellBtn(x,d,T)}</td>`).join('')}<td class="pcol">${r?pc(r.p):'—'}</td></tr>`}).join('')+`</tbody></table></div>
  <div class="legend" style="margin-top:14px"><i style="background:var(--s-lav)"></i>Hecho<i style="background:repeating-linear-gradient(135deg,var(--p-lav),var(--p-lav) 3px,var(--surface) 3px,var(--surface) 6px);border:1px solid var(--s-lav)"></i>Comodín${S.settings.grace?' ('+graceLeft(T.slice(0,7))+' este mes)':''}<span style="margin-left:6px">Toca una celda para cambiar su estado.</span></div>`;
 }else{
  const d0=pd(R.start);h+=`<div class="mgrid">${DIA1.map(x=>`<span class="wh">${x}</span>`).join('')}`+monthCells(d0.getFullYear(),d0.getMonth()).map(s=>{
   if(!s)return'<span class="md blank"></span>';const sc=dayScore(s),dots=hs.filter(x=>S.logs[x.id]&&S.logs[x.id][s]).slice(0,8).map(x=>`<i style="${cst(x.color)}"></i>`).join('');
   return`<button class="md ${s===T?'today':''} ${s===ui.cal.sel?'sel':''} ${sc.r>=1?'f4':sc.r>=.5?'f2':''}" ${s>T?'disabled':''} data-act="calSel" data-d="${s}"><b>${dnum(s)}</b><span class="dd">${dots}</span></button>`}).join('')+'</div>';
 }
 h+='</section>';
 if(mode==='month'&&hs.length){
  const sel=ui.cal.sel>=R.start&&ui.cal.sel<=R.end?ui.cal.sel:R.start;const sc=dayScore(sel);
  h+=`<section class="card" style="margin-top:18px"><div class="sec-h" style="margin:0 0 6px"><h2>${fmtLong(sel)}</h2><small>${sc.r==null?'Sin hábitos':pc(sc.r)+' del día'}</small></div>${hs.filter(x=>x.created<=sel).map(x=>`<div class="drow" style="${cst(x.color)}">${cellBtn(x,sel,T)}<span class="nm">${esc(x.emoji)} ${esc(x.name)}</span></div>`).join('')||'<p class="muted small">Ningún hábito existía en esa fecha.</p>'}</section>`}
 if(hs.length)h+=`<section class="card" style="margin-top:18px"><div class="sec-h" style="margin:0 0 6px"><h2>Por hábito</h2><small>${label}</small></div>`+hs.map(x=>{const r=habitRange(x,R.start,R.end);return`<div class="prow" style="${cst(x.color)}"><span class="nm">${esc(x.emoji)} ${esc(x.name)}</span><div class="bar"><i style="width:${r?r.p*100:0}%"></i></div><span class="v">${r?pc(r.p):'—'}</span></div>`}).join('')+`</section>`;
 return h}

/* ---------- Estadísticas ---------- */
function barChart(items,h=150){
 const W=320,pl=28,pb=22,pt=10,ph=h-pb-pt,n=items.length,bw=(W-pl-6)/n;let g='';
 [0,50,100].forEach(v=>{const y=pt+ph*(1-v/100);g+=`<line class="gl" x1="${pl}" x2="${W-4}" y1="${y}" y2="${y}"/><text class="ax" x="${pl-6}" y="${y+3}" text-anchor="end">${v}</text>`});
 items.forEach((it,i)=>{const v=it.v==null?0:it.v*100,bh=it.v==null?0:Math.max(2,ph*v/100),x=pl+i*bw+bw*.18,w=bw*.64;
  g+=`<rect class="bar-r ${(it.hi===undefined?i===n-1:it.hi)?'hi':''}" x="${x.toFixed(1)}" y="${(pt+ph-bh).toFixed(1)}" width="${w.toFixed(1)}" height="${bh.toFixed(1)}" rx="4"><title>${esc(it.l)}: ${it.v==null?'sin datos':Math.round(v)+'%'}</title></rect><text class="ax" x="${(x+w/2).toFixed(1)}" y="${h-6}" text-anchor="middle">${esc(it.s)}</text>`});
 return`<svg viewBox="0 0 ${W} ${h}" class="chart" role="img" aria-label="Gráfico de barras">${g}</svg>`}
function lineChart(items,h=150){
 const W=320,pl=28,pb=22,pt=14,pr=10,ph=h-pb-pt,n=items.length,step=(W-pl-pr)/(n-1||1);let g='';
 [0,50,100].forEach(v=>{const y=pt+ph*(1-v/100);g+=`<line class="gl" x1="${pl}" x2="${W-pr}" y1="${y}" y2="${y}"/><text class="ax" x="${pl-6}" y="${y+3}" text-anchor="end">${v}</text>`});
 const pts=items.map((it,i)=>it.v==null?null:[pl+i*step,pt+ph*(1-it.v)]);const ok=pts.filter(Boolean);
 if(ok.length>1){g+=`<path class="ar" d="M${ok[0][0]},${pt+ph} ${ok.map(p=>'L'+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')} L${ok[ok.length-1][0]},${pt+ph}Z"/><path class="ln" d="${ok.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')}"/>`}
 let li=-1;pts.forEach((p,i)=>{if(p)li=i});
 pts.forEach((p,i)=>{if(!p)return;g+=`<circle class="pt ${i===li?'hi':''}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i===li?4:2.6}"><title>${esc(items[i].l)}: ${Math.round(items[i].v*100)}%</title></circle>`});
 if(li>=0)g+=`<text class="vl" x="${Math.min(W-pr-8,pts[li][0])}" y="${Math.max(10,pts[li][1]-9)}" text-anchor="middle">${Math.round(items[li].v*100)}%</text>`;
 items.forEach((it,i)=>{if(i%2===(n-1)%2)g+=`<text class="ax" x="${(pl+i*step).toFixed(1)}" y="${h-6}" text-anchor="middle">${esc(it.s)}</text>`});
 return`<svg viewBox="0 0 ${W} ${h}" class="chart" role="img" aria-label="Gráfico de líneas">${g}</svg>`}
function heatmap(){
 const T=todayS(),weeks=26,mon=addDays(T,-wd(T)),start=addDays(mon,-(weeks-1)*7),cs=12,gp=3,st=cs+gp,lx=16,ty=16;let g='';
 for(let i=0;i<weeks;i++){const d0=addDays(start,i*7);if(dnum(d0)<=7)g+=`<text class="ax" x="${lx+i*st}" y="9">${MES[+d0.slice(5,7)-1].slice(0,3)}</text>`;
  for(let j=0;j<7;j++){const d=addDays(d0,j);if(d>T)continue;const r=dayScore(d).r;g+=`<rect class="c${lvl(r)}" x="${lx+i*st}" y="${ty+j*st}" width="${cs}" height="${cs}" rx="3"><title>${fmtShort(d)}: ${r==null?'sin datos':pc(r)}</title></rect>`}}
 [0,2,4].forEach(j=>g+=`<text class="ax" x="0" y="${ty+j*st+9}">${DIA1[j]}</text>`);
 return`<div class="hm"><svg width="${lx+weeks*st}" height="${ty+7*st}" viewBox="0 0 ${lx+weeks*st} ${ty+7*st}" role="img" aria-label="Mapa de actividad de las últimas 26 semanas">${g}</svg></div>`}
function vStats(){
 const T=todayS(),mon=addDays(T,-wd(T));let h=head('Tu progreso','Estadísticas');
 if(!S.habits.length&&!S.adds.length)return h+`<div class="card empty"><b>Aún no hay datos</b><p>Completa tu primer hábito y aquí verás tu evolución.</p><button class="btn pri" data-act="newHabit">${ic('plus')}Crear hábito</button></div>`;
 const c30=avgRatio(addDays(T,-29),T),p30=avgRatio(addDays(T,-59),addDays(T,-30)),d30=c30!=null&&p30!=null?Math.round((c30-p30)*100):null;
 let longest=0,lname='';S.habits.filter(x=>x.type==='daily').forEach(x=>{const b=stats(x).best;if(b>longest){longest=b;lname=x.name}});
 let total=0;for(const id in S.logs)for(const d in S.logs[id])if(S.logs[id][d]===1)total++;
 const lv=levelOf(xpTotal());
 h+=`<div class="bigstats"><div class="card"><b>${pc(c30)}${d30!=null?`<span class="delta ${d30>=0?'up':'dn'}">${d30>=0?'+':''}${d30}</span>`:''}</b><span>Consistencia, últimos 30 días</span></div><div class="card"><b>${longest}${longest?' d':''}</b><span>Racha más larga${lname?' · '+esc(lname):''}</span></div><div class="card"><b>${total}</b><span>Hábitos completados</span></div>${S.settings.gamify?`<div class="card"><b>Nivel ${lv.L}</b><span>${lv.xp} XP · ${lv.name}</span></div>`:`<div class="card"><b>${globalStreaks().best} d</b><span>Mejor racha de días completos</span></div>`}</div>`;
 const wk=[];for(let i=11;i>=0;i--){const s=addDays(mon,-7*i);wk.push({v:avgRatio(s,addDays(s,6)),l:'Semana del '+fmtShort(s),s:dnum(s)+'/'+(+s.slice(5,7))})}
 const mo=[];for(let i=5;i>=0;i--){const d=pd(T);const m0=new Date(d.getFullYear(),d.getMonth()-i,1,12);const s=ds(m0),e=ds(new Date(m0.getFullYear(),m0.getMonth()+1,0,12));mo.push({v:avgRatio(s,e),l:cap(MES[m0.getMonth()])+' '+m0.getFullYear(),s:MES[m0.getMonth()].slice(0,3)})}
 const wsum=Array(7).fill(0),wn=Array(7).fill(0);for(let i=0;i<90;i++){const d=addDays(T,-i),r=dayScore(d).r;if(r!=null){wsum[wd(d)]+=r;wn[wd(d)]++}}
 const wdv=wsum.map((s,i)=>({v:wn[i]?s/wn[i]:null,l:cap(DIA[i]),s:DIA1[i],hi:false}));
 const bestWd=wdv.reduce((b,x,i)=>x.v!=null&&(b<0||x.v>wdv[b].v)?i:b,-1);if(bestWd>=0)wdv[bestWd].hi=true;
 const tw=periodOf('weekly',T),pw=periodOf('weekly',addDays(tw.start,-1)),tm=periodOf('monthly',T),pm=periodOf('monthly',addDays(tm.start,-1));
 const cmp=(lb,a,b)=>{const d=a!=null&&b!=null?Math.round((a-b)*100):null;return`<div class="rl"><span>${lb}</span><b>${pc(a)} <span class="muted">vs ${pc(b)}</span>${d!=null?`<span class="delta ${d>=0?'up':'dn'}">${d>=0?'+':''}${d}</span>`:''}</b></div>`};
 h+=`<div class="cols2"><section class="card"><div class="sec-h" style="margin:0 0 8px"><h2>Evolución semanal</h2><small>12 semanas</small></div>${lineChart(wk)}</section>
 <section class="card"><div class="sec-h" style="margin:0 0 8px"><h2>Evolución mensual</h2><small>6 meses</small></div>${barChart(mo)}</section>
 <section class="card"><div class="sec-h" style="margin:0 0 8px"><h2>Días más productivos</h2><small>${bestWd>=0?'Mejor: '+DIA[bestWd]:'Últimos 90 días'}</small></div>${barChart(wdv)}</section>
 <section class="card"><div class="sec-h" style="margin:0 0 8px"><h2>Comparación de períodos</h2></div>${cmp('Esta semana',avgRatio(tw.start,tw.end),avgRatio(pw.start,pw.end))}${cmp('Este mes',avgRatio(tm.start,tm.end),avgRatio(pm.start,pm.end))}${cmp('Últimos 30 días',c30,p30)}<p class="muted small" style="margin-top:10px">Cada cifra compara con el período inmediato anterior, en puntos porcentuales.</p></section></div>`;
 h+=`<section class="card" style="margin-top:18px"><div class="sec-h" style="margin:0 0 10px"><h2>Actividad</h2><small>Últimas 26 semanas</small></div>${heatmap()}<div class="legend">Menos<i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i>Más</div></section>`;
 const rated=S.habits.filter(x=>!x.archived&&stats(x).rate!=null&&stats(x).closedN>=3).sort((a,b)=>stats(b).rate-stats(a).rate);
 if(rated.length){const top=rated.slice(0,3),bot=rated.slice(-3).reverse().filter(x=>!top.includes(x));
  const rows=l=>l.map(x=>`<div class="prow" style="${cst(x.color)}"><span class="nm">${esc(x.emoji)} ${esc(x.name)}</span><div class="bar"><i style="width:${stats(x).rate*100}%"></i></div><span class="v">${pc(stats(x).rate)}</span></div>`).join('');
  h+=`<div class="cols2" style="margin-top:18px"><section class="card"><h2 style="margin-bottom:6px">Mayor cumplimiento</h2>${rows(top)}</section>${bot.length?`<section class="card"><h2 style="margin-bottom:6px">Menor cumplimiento</h2>${rows(bot)}<p class="muted small" style="margin-top:8px">Es el mejor lugar para ajustar el horario o la meta.</p></section>`:''}</div>`}
 if(S.settings.gamify){const defs=badgeDefs();h+=`<section class="card" style="margin-top:18px"><div class="sec-h" style="margin:0 0 14px"><h2>Logros</h2><small>${defs.filter(b=>b.earned).length} de ${defs.length}</small></div><div class="bdgs">${defs.map(b=>`<div class="bdg ${b.earned?'on':''}" style="--c:var(--p-${b.tone});--cs:var(--s-${b.tone})"><div class="bdg-i">${b.n}</div><b>${esc(b.name)}</b><small>${b.earned?(S.badges[b.id]?fmtShort(S.badges[b.id]):'Logrado'):b.sub}</small></div>`).join('')}</div></section>`}
 return h}

/* ---------- Configuración ---------- */
function paintFoot(){
 const el=$('#side-foot');if(!el)return;const lv=levelOf(xpTotal());
 const stt={syncing:'Sincronizando…',sync:'Guardado y sincronizado con tu cuenta',local:'Guardado en este dispositivo',err:'No se pudo sincronizar: guardado solo aquí. Reintentando.',big:'Demasiados datos para sincronizar'}[remote.status]||'';
 el.innerHTML=(S.settings.gamify?`<div class="mini-lv"><b>Nivel ${lv.L} · ${lv.name}</b><div class="bar"><i style="width:${(lv.xp-lv.base)/(lv.next-lv.base)*100}%"></i></div><span>${lv.xp} XP</span></div>`:'')+`<button class="btn sm" data-act="themeToggle">${ic(isDark()?'sun':'moon')}${isDark()?'Tema claro':'Tema oscuro'}</button><p class="sync">${stt}</p>`;
 const sp=$('#sync-line');if(sp)sp.textContent=stt}
function vSettings(){
 const s=S.settings;
 const tg=(k,t,d)=>`<div class="sw-row"><div><b>${t}</b><p>${d}</p></div><label class="tg"><input type="checkbox" data-change="toggle" data-k="${k}" ${s[k]?'checked':''} aria-label="${t}"><span></span></label></div>`;
 let h=head('Personaliza','Configuración');
 h+=`<div class="cols2">
 <section class="card"><h2 style="margin-bottom:14px">Perfil y apariencia</h2><div class="field"><label for="s-name">Tu nombre</label><input class="input" id="s-name" data-change="setName" value="${esc(s.name)}" placeholder="Para el saludo" maxlength="30"></div>
 <div class="lbl" style="margin-bottom:8px">Tema</div><div class="seg"><button class="${s.theme==='light'?'on':''}" aria-pressed="${s.theme==='light'}" data-act="setTheme" data-t="light">Claro</button><button class="${s.theme==='dark'?'on':''}" aria-pressed="${s.theme==='dark'}" data-act="setTheme" data-t="dark">Oscuro</button><button class="${s.theme==='system'?'on':''}" aria-pressed="${s.theme==='system'}" data-act="setTheme" data-t="system">Sistema</button></div></section>
 <section class="card"><h2 style="margin-bottom:6px">Motivación</h2>${tg('showQuote','Frase del día','Se muestra en tu pantalla de inicio.')}${tg('gamify','Niveles, XP e insignias','Reconocimiento discreto por tu constancia.')}
 <div class="field" style="margin:12px 0 0"><label for="s-quotes">Tus frases (una por línea)</label><textarea class="input" id="s-quotes" data-change="setQuotes" rows="5">${esc(s.quotes.join('\n'))}</textarea></div></section>
 <section class="card"><h2 style="margin-bottom:6px">Comodines de racha</h2>${tg('grace','Proteger rachas','Un comodín cubre un día perdido sin cortar tu cadena.')}
 <div class="sw-row"><div><b>Comodines por mes</b><p>Cuántos puedes usar cada mes.</p></div><input class="input" style="width:76px" type="number" min="0" max="10" id="s-gm" data-change="setNum" value="${s.graceMonthly}" aria-label="Comodines por mes"></div></section>
 <section class="card"><h2 style="margin-bottom:12px">Categorías</h2>${S.cats.map(c=>`<div class="row" style="margin-bottom:8px;flex-wrap:nowrap"><input class="input" data-change="catName" data-id="${c.id}" value="${esc(c.name)}" aria-label="Nombre de categoría" maxlength="24"><button class="icon-btn sm" data-act="delCat" data-id="${c.id}" aria-label="Eliminar categoría">${ic('trash')}</button></div>`).join('')||'<p class="muted small">Aún no tienes categorías.</p>'}<button class="btn sm" style="margin-top:6px" data-act="newCat">${ic('plus')}Nueva categoría</button></section>
 <section class="card" style="grid-column:1/-1"><h2 style="margin-bottom:6px">Tus datos</h2><p class="muted small" style="margin-bottom:14px" id="sync-line"></p><div class="row"><button class="btn" data-act="openExport">${ic('download')}Exportar copia (JSON)</button><button class="btn" data-act="openImport">${ic('upload')}Importar copia</button><button class="btn dng" data-act="askReset">${ic('trash')}Borrar todo</button></div><p class="muted small" style="margin-top:12px">Tus registros se guardan en este navegador y, si tienes sesión, también en tu cuenta. La exportación es tu respaldo manual.</p></section></div>`;
 return h}

const VIEWS={home:vHome,habits:vHabits,calendar:vCal,stats:vStats,settings:vSettings};
function render(){
 applyTheme();const v=$('#view');
 v.innerHTML=VIEWS[ui.view]();
 if(ui.lastView!==ui.view){v.classList.remove('enter');void v.offsetWidth;v.classList.add('enter');window.scrollTo(0,0)}
 ui.lastView=ui.view;
 const nav=(c)=>NAV.map(n=>`<button class="${c} ${ui.view===n[0]?'on':''}" data-act="nav" data-v="${n[0]}" ${ui.view===n[0]?'aria-current="page"':''}>${ic(n[3])}<span>${c==='sn'?n[1]:n[2]}</span></button>`).join('');
 $('#nav-side').innerHTML=nav('sn');$('#nav-tab').innerHTML=nav('tb');
 $('#banner').innerHTML=(warn.corrupt?`<div class="banner err" role="alert"><span><b>No se pudieron leer tus datos guardados.</b> Guardamos una copia aparte y empezamos de nuevo. Si tienes un respaldo, impórtalo en Configuración.</span><button class="btn sm" data-act="dismissWarn" data-k="corrupt">Entendido</button></div>`:'')+(warn.store?`<div class="banner err" role="alert"><span><b>Tus cambios no se están guardando en este dispositivo.</b> El navegador bloquea el almacenamiento. Exporta una copia para no perder nada.</span><button class="btn sm" data-act="openExport">Exportar copia</button></div>`:'')+(S.demo?`<div class="banner"><span><b>Estás viendo datos de ejemplo.</b> Cuando quieras, empieza con tu propia cadena.</span><button class="btn sm pri" data-act="startFresh">Empezar desde cero</button></div>`:'');
 const rf=$('#ringfg');if(rf){const to=rf.dataset.to;requestAnimationFrame(()=>requestAnimationFrame(()=>{rf.style.strokeDashoffset=to}));ui.ringPrev=+to}
 paintFoot();ui.just=null;tick()}
/* ============ hojas (sheets) ============ */
function openSheet(html,kind){
 if(!ui.sheet)ui.opener=document.activeElement;
 $('#sheet').innerHTML=html;$('#ov').inert=false;$('.app').inert=true;$('#nav-tab').inert=true;   /* inert: el foco y los lectores de pantalla se quedan dentro de la hoja */
 $('#ov').classList.add('open');$('#sheet').scrollTop=0;ui.sheet=kind||'x';tick();
 const f=$('#sheet input[type=text],#sheet textarea');
 if(f&&kind&&/form/.test(kind)&&!/Mobi/.test(navigator.userAgent))f.focus({preventScroll:true});
 else{const c=$('#sheet .icon-btn');if(c)c.focus({preventScroll:true})}}
function closeSheet(){
 $('#ov').classList.remove('open');$('#ov').inert=true;$('.app').inert=false;$('#nav-tab').inert=false;ui.sheet=null;
 const o=ui.opener;ui.opener=null;const t=(o&&o!==document.body&&document.contains(o))?o:$('#view');if(t)t.focus({preventScroll:true})}
const shHead=t=>`<div class="sh-h"><h2 id="sh-title">${t}</h2><button class="icon-btn" data-act="closeSheet" aria-label="Cerrar">${ic('x')}</button></div>`;
const swatches=cur=>`<div class="swatches">${COLORS.map(c=>`<button class="sw ${c===cur?'on':''}" style="${cst(c)}" data-act="pickColor" data-c="${c}" aria-label="${CNAME[c]}" title="${CNAME[c]}"></button>`).join('')}</div>`;
const emojiGrid=cur=>`<div class="emojis">${EMOJIS.map(e=>`<button class="emj ${e===cur?'on':''}" data-act="pickEmoji" data-e="${e}">${e}</button>`).join('')}</div>`;

function sHabitForm(id){
 const h=id?H(id):{name:'',emoji:'🎯',color:'lav',desc:'',cat:'',type:'daily',days:[0,1,2,3,4,5,6],target:3,time:''};
 ui.form={id:id||null,color:h.color,days:h.days.slice()};
 openSheet(shHead(id?'Editar hábito':'Nuevo hábito')+`
 <div class="field"><label for="f-name">Nombre</label><input class="input" type="text" id="f-name" value="${esc(h.name)}" maxlength="50" placeholder="Ej. Leer 20 minutos"></div>
 <div class="field"><label for="f-desc">Descripción (opcional)</label><input class="input" type="text" id="f-desc" value="${esc(h.desc||'')}" maxlength="90" placeholder="Qué cuenta como hecho"></div>
 <div class="field"><label for="f-emoji">Icono</label><input class="input" type="text" id="f-emoji" value="${esc(h.emoji)}" maxlength="4" style="width:90px;font-size:20px;text-align:center">${emojiGrid(h.emoji)}</div>
 <div class="field"><span class="lbl">Color</span>${swatches(h.color)}</div>
 <div class="two"><div class="field"><label for="f-type">Objetivo</label><select class="input" id="f-type" data-change="formType">${Object.keys(TYPES).map(k=>`<option value="${k}" ${h.type===k?'selected':''}>${TYPES[k]}</option>`).join('')}</select></div>
 <div class="field" id="w-target" ${h.type==='daily'?'hidden':''}><label for="f-target">Veces por período</label><input class="input" type="number" min="1" max="31" id="f-target" value="${h.target}"></div></div>
 <div class="field" id="w-days" ${h.type!=='daily'?'hidden':''}><span class="lbl">Días de cumplimiento</span><div class="daychips">${DIA1.map((d,i)=>`<button class="${h.days.includes(i)?'on':''}" data-act="toggleDay" data-i="${i}" aria-label="${DIA[i]}">${d}</button>`).join('')}</div></div>
 <div class="two"><div class="field"><label for="f-cat">Categoría</label><select class="input" id="f-cat"><option value="">Sin categoría</option>${S.cats.map(c=>`<option value="${c.id}" ${h.cat===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
 <div class="field"><label for="f-time">Recordatorio visual</label><input class="input" type="time" id="f-time" value="${esc(h.time||'')}"></div></div>
 <div class="actrow" style="margin-top:6px"><button class="btn pri" data-act="saveHabit">${id?'Guardar cambios':'Crear hábito'}</button><button class="btn" data-act="closeSheet">Cancelar</button></div>`,'form-habit')}
function saveHabit(){
 const name=$('#f-name').value.trim();if(!name){toast('Ponle un nombre al hábito');$('#f-name').focus();return}
 const type=$('#f-type').value,days=ui.form.days.slice().sort(),target=clamp(parseInt($('#f-target').value)||1,1,31);
 if(type==='daily'&&!days.length){toast('Elige al menos un día');return}
 const data={name,desc:$('#f-desc').value.trim(),emoji:$('#f-emoji').value.trim()||'🎯',color:ui.form.color,type,days:type==='daily'?days:[0,1,2,3,4,5,6],target,cat:$('#f-cat').value,time:$('#f-time').value};
 if(ui.form.id){Object.assign(H(ui.form.id),data);toast('Cambios guardados')}
 else{S.habits.push(Object.assign({id:uid(),created:todayS(),archived:false},data));toast('Hábito creado')}
 save();closeSheet();render()}

function sHabitDetail(id){
 const h=H(id);if(!h)return;const st=stats(h),T=todayS(),u=st.units.slice(-30),L=S.logs[id]||{};
 const unit=h.type==='daily'?'días':PUNITS[h.type];
 let msg='';
 if(st.cur===0&&st.runs.length){const r=st.runs[st.runs.length-1];msg=`<div class="note">Tu cadena anterior llegó a <b>${r.len} ${unit}</b>. Cada día es un eslabón nuevo: puedes empezar otra hoy.</div>`}
 else if(st.cur>0&&st.best>st.cur)msg=`<div class="note">Te faltan <b>${st.best-st.cur+1} ${unit}</b> para superar tu récord de ${st.best}.</div>`;
 else if(st.cur>0&&st.cur===st.best)msg=`<div class="note">Estás en tu mejor racha. Cada ${h.type==='daily'?'día':'período'} la hace más larga.</div>`;
 const hist=[];const mon=addDays(T,-wd(T)-15*7);for(let i=0;i<16*7;i++){const d=addDays(mon,i);if(d>T){hist.push('<i style="visibility:hidden"></i>');continue}hist.push(`<i class="${L[d]===1?'on':L[d]===2?'gr':''}" title="${fmtShort(d)}"></i>`)}
 let missed=[];if(S.settings.grace&&h.type==='daily'){for(let i=1;i<=7;i++){const d=addDays(T,-i);if(d>=h.created&&h.days.includes(wd(d))&&!L[d])missed.push(d)}}
 const left=graceLeft(T.slice(0,7));
 openSheet(`<div class="sh-h" style="${cst(h.color)}"><div class="row" style="flex-wrap:nowrap;min-width:0"><span class="hc-em">${esc(h.emoji)}</span><div style="min-width:0"><h2 style="font-size:21px">${esc(h.name)}</h2><small class="muted">${esc(metaOf(h))}${h.archived?' · Archivado':''}</small></div></div><button class="icon-btn" data-act="closeSheet" aria-label="Cerrar">${ic('x')}</button></div>
 <div style="${cst(h.color)}"><div class="stats4"><div><b>${st.cur}</b><span>Racha</span></div><div><b>${st.best}</b><span>Récord</span></div><div><b>${st.total}</b><span>Total</span></div><div><b>${pc(st.rate)}</b><span>Éxito</span></div></div>
 ${msg}<p class="lbl-row">Cadena reciente</p><div class="chainv">${u.length?u.map(x=>`<i class="${x.done?'on':''} ${x.open&&!x.done?'op':''}" title="${fmtShort(x.s)}"></i>`).join(''):'<span class="muted small">Aún no hay registros.</span>'}</div>
 <p class="lbl-row">Calendario histórico · 16 semanas</p><div class="hist">${hist.join('')}</div></div>
 ${st.runs.length?`<p class="lbl-row">Historial de cadenas</p><div>${st.runs.slice(-5).reverse().map(r=>`<div class="rl"><span>${fmtShort(r.s)} – ${fmtShort(r.e)}</span><b>${r.len} ${unit}</b></div>`).join('')}</div>`:''}
 ${missed.length?`<p class="lbl-row">Proteger con comodín · ${left} ${left===1?'disponible':'disponibles'} este mes</p><div class="chips">${missed.map(d=>`<button class="chip" ${left?'':'disabled'} data-act="useGrace" data-id="${id}" data-d="${d}">${ic('shield')} ${fmtShort(d)}</button>`).join('')}</div>`:''}
 <div class="actrow">${h.archived?`<button class="btn" data-act="restore" data-id="${id}">Restaurar</button>`:`<button class="btn" data-act="editHabit" data-id="${id}">${ic('edit')}Editar</button><button class="btn" data-act="dupHabit" data-id="${id}">${ic('copy')}Duplicar</button><button class="btn" data-act="archiveHabit" data-id="${id}">${ic('archive')}Archivar</button>`}<button class="btn dng" data-act="askDelHabit" data-id="${id}">${ic('trash')}Eliminar</button></div>`,'habit')}
function sConfirm(title,text,btns){openSheet(shHead(title)+`<p class="muted" style="margin-bottom:18px">${text}</p><div class="actrow" style="margin-top:0">${btns}<button class="btn" data-act="closeSheet">Cancelar</button></div>`,'confirm')}

/* hábitos a dejar */
const TRIG=['Estrés','Aburrimiento','Cansancio','Ansiedad','Social','Soledad'];
function msgFor(d){return d<1?'Cada hora cuenta. Estás en camino.':d<3?'Ya diste el paso más difícil: empezar.':d<7?'Tu cuerpo y tu mente ya notan la diferencia.':d<14?'Una semana es una señal clara de que puedes.':d<30?'La constancia se está volviendo identidad.':d<90?'Ya no es un intento: es un nuevo estilo de vida.':'Lo que construiste es sólido. Mira cuánto avanzaste.'}
function sAddForm(id){
 const a=id?A(id):{name:'',emoji:'🚭',color:'mint',why:'',start:Date.now()};ui.form={id:id||null,color:a.color};
 const canStart=!id||!a.events.some(e=>e.type!=='desliz');
 openSheet(shHead(id?'Editar objetivo':'Nuevo objetivo')+`
 <div class="field"><label for="f-name">¿Qué quieres dejar o reducir?</label><input class="input" type="text" id="f-name" value="${esc(a.name)}" maxlength="50" placeholder="Ej. Dejar de fumar, redes por la noche…"></div>
 <div class="field"><label for="f-emoji">Icono</label><input class="input" type="text" id="f-emoji" value="${esc(a.emoji)}" maxlength="4" style="width:90px;font-size:20px;text-align:center">${emojiGrid(a.emoji)}</div>
 <div class="field"><span class="lbl">Color</span>${swatches(a.color)}</div>
 ${canStart?`<div class="field"><label for="f-start">Fecha y hora de inicio</label><input class="input" type="datetime-local" id="f-start" value="${toLocalInput(a.start)}" max="${toLocalInput(Date.now())}"></div>`:''}
 <div class="field"><label for="f-why">Why I Started · tus motivos</label><textarea class="input" id="f-why" placeholder="Escribe por qué lo haces. Lo leerás cuando más lo necesites.">${esc(a.why||'')}</textarea></div>
 <div class="actrow" style="margin-top:6px"><button class="btn pri" data-act="saveAdd">${id?'Guardar cambios':'Empezar contador'}</button><button class="btn" data-act="closeSheet">Cancelar</button></div>`,'form-add')}
function saveAdd(){
 const name=$('#f-name').value.trim();if(!name){toast('Ponle un nombre al objetivo');return}
 const st=$('#f-start');let start=st?(new Date(st.value).getTime()||Date.now()):null;if(start&&start>Date.now())start=Date.now();
 const d={name,emoji:$('#f-emoji').value.trim()||'🎯',color:ui.form.color,why:$('#f-why').value.trim()};
 if(ui.form.id){const a=A(ui.form.id);Object.assign(a,d);if(st&&start){a.start=start;a.origin=start}}
 else{const s=start||Date.now();S.adds.push(Object.assign({id:uid(),start:s,origin:s,events:[],notes:'',archived:false},d))}
 save();closeSheet();render();toast(ui.form.id?'Cambios guardados':'Contador en marcha')}
function sAddDetail(id){
 const a=A(id);if(!a)return;const ms=Date.now()-a.start,best=Math.max(bestMs(a),ms),segs=segments(a),evs=a.events.slice().sort((x,y)=>y.ts-x.ts);
 const cnt={recaida:0,desliz:0,reinicio:0};evs.forEach(e=>cnt[e.type]++);
 const trig={};evs.forEach(e=>{const k=(e.trigger||'').trim();if(k){const l=k.toLowerCase();(trig[l]=trig[l]||{n:0,t:k}).n++}});
 const tl=Object.values(trig).sort((x,y)=>y.n-x.n).slice(0,4);
 const mx=Math.max(1,...segs.map(s=>s.e-s.s)),avg=segs.reduce((s,x)=>s+(x.e-x.s),0)/segs.length;
 const TL={recaida:'Recaída',desliz:'Desliz',reinicio:'Reinicio'};
 const bd=x=>{const t=dur(x);return t.d+' d '+t.h+' h'};
 openSheet(`<div class="sh-h" style="${cst(a.color)}"><div class="row" style="flex-wrap:nowrap;min-width:0"><span class="hc-em">${esc(a.emoji)}</span><h2 style="font-size:21px;min-width:0">${esc(a.name)}</h2></div><button class="icon-btn" data-act="closeSheet" aria-label="Cerrar">${ic('x')}</button></div>
 <div style="${cst(a.color)}">${liveBox(a.start)}<p class="muted small" style="margin:12px 0 4px">Desde ${fmtDT(a.start)} · ${msgFor(ms/864e5)}</p>
 <div class="stats4" style="margin-top:14px"><div><b>${Math.floor(best/864e5)}</b><span>Récord (d)</span></div><div><b>${cnt.recaida}</b><span>Recaídas</span></div><div><b>${cnt.desliz}</b><span>Deslices</span></div><div><b>${segs.length}</b><span>Rachas</span></div></div></div>
 <div class="actrow" style="margin-top:0"><button class="btn pri" data-act="newEvent" data-id="${id}">Registrar episodio</button><button class="btn" data-act="editAdd" data-id="${id}">${ic('edit')}Editar</button></div>
 <p class="lbl-row">Why I Started</p>${a.why?`<div class="why">${esc(a.why)}</div>`:`<div class="note">Aún no escribiste tus motivos. Tenerlos a mano ayuda en los días difíciles.</div>`}
 <div class="field" style="margin-top:12px"><label for="a-why">Editar mis motivos</label><textarea class="input" id="a-why" data-change="addWhy" data-id="${id}" placeholder="Por qué empecé…">${esc(a.why||'')}</textarea></div>
 <div class="field"><label for="a-notes">Notas personales</label><textarea class="input" id="a-notes" data-change="addNotes" data-id="${id}" placeholder="Qué te ayuda, qué aprendiste…">${esc(a.notes||'')}</textarea></div>
 <p class="lbl-row">Evolución de tus rachas</p>${segs.slice(-8).map((s,i,arr)=>`<div class="prow" style="${cst(a.color)}"><span class="nm">${i===arr.length-1&&s.open?'Actual':fmtShort(ds(new Date(s.s)))}</span><div class="bar"><i style="width:${(s.e-s.s)/mx*100}%"></i></div><span class="v">${Math.floor((s.e-s.s)/864e5)} d</span></div>`).join('')}
 <p class="muted small" style="margin-top:6px">Promedio por racha: ${bd(avg)}</p>
 ${tl.length?`<p class="lbl-row">Desencadenantes frecuentes</p><div class="chips">${tl.map(t=>`<span class="pill" style="--c:var(--p-cream)">${esc(t.t)} · ${t.n}</span>`).join('')}</div>`:''}
 ${evs.length?`<p class="lbl-row">Historial</p>${evs.map(e=>`<div class="ev"><span class="pill tag ${e.type}">${TL[e.type]}</span><div style="min-width:0"><b>${fmtDT(e.ts)}</b>${e.prev!=null?` <span class="muted">· racha de ${bd(e.prev)}</span>`:''}${e.trigger?`<br><span class="muted">Desencadenante: ${esc(e.trigger)}</span>`:''}${e.note?`<br>${esc(e.note)}`:''}</div></div>`).join('')}`:''}
 <div class="actrow"><button class="btn" data-act="archiveAdd" data-id="${id}">${ic('archive')}${a.archived?'Restaurar':'Archivar'}</button><button class="btn dng" data-act="askDelAdd" data-id="${id}">${ic('trash')}Eliminar</button></div>`,'add')}
function sEventForm(id){
 const a=A(id);ui.form={id,type:'recaida'};const known=[...new Set(a.events.map(e=>e.trigger).filter(Boolean).concat(TRIG))].slice(0,10);
 openSheet(shHead('Registrar episodio')+`<p class="muted small" style="margin:-8px 0 14px">Sin juicios: registrarlo es parte del camino. Tu récord no se borra.</p>
 <button class="opt on" data-act="pickEv" data-t="recaida"><span><b>Recaída</b><span>Volví al hábito. El contador vuelve a cero y empiezas otra racha.</span></span></button>
 <button class="opt" data-act="pickEv" data-t="desliz"><span><b>Desliz puntual</b><span>Un episodio aislado. Se registra, pero tu racha sigue.</span></span></button>
 <button class="opt" data-act="pickEv" data-t="reinicio"><span><b>Reinicio voluntario</b><span>Decido empezar de nuevo desde ahora, por elección.</span></span></button>
 <div class="field" style="margin-top:14px"><label for="e-when">Cuándo</label><input class="input" type="datetime-local" id="e-when" value="${toLocalInput(Date.now())}" max="${toLocalInput(Date.now())}"></div>
 <div class="field"><label for="e-trig">Desencadenante (opcional)</label><input class="input" type="text" id="e-trig" maxlength="40" placeholder="¿Qué lo disparó?"><div class="chips" style="margin-top:8px">${known.map(t=>`<button class="chip" data-act="pickTrig" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
 <div class="field"><label for="e-note">Nota (opcional)</label><textarea class="input" id="e-note" placeholder="Qué pasó, qué harías distinto…"></textarea></div>
 <div class="actrow" style="margin-top:6px"><button class="btn pri" data-act="saveEvent">Guardar</button><button class="btn" data-act="openAdd" data-id="${id}">Volver</button></div>`,'form-event')}
function saveEvent(){
 const a=A(ui.form.id),type=ui.form.type;let ts=new Date($('#e-when').value).getTime()||Date.now();ts=Math.min(ts,Date.now());
 if(type!=='desliz'&&ts<a.start)ts=a.start;if(ts<a.origin)ts=a.origin;
 const ev={id:uid(),ts,type,trigger:$('#e-trig').value.trim(),note:$('#e-note').value.trim()};
 if(type!=='desliz'){ev.prev=ts-a.start;a.start=ts}
 a.events.push(ev);save();
 const r=Math.floor(bestMs(a)/864e5);
 toast(type==='desliz'?'Registrado. Tu racha sigue en pie.':type==='recaida'?'Registrado. Tu récord de '+r+' días sigue siendo tuyo.':'Nuevo comienzo registrado. Vamos de nuevo.');
 sAddDetail(a.id);render()}

/* metas, categorías, datos */
function sGoalForm(id){
 const g=id?S.goals.find(x=>x.id===id):{title:'',target:10,current:0,unit:'',due:'',color:'lav'};ui.form={id:id||null,color:g.color||'lav'};
 openSheet(shHead(id?'Editar meta':'Nueva meta')+`<div class="field"><label for="g-title">Meta</label><input class="input" type="text" id="g-title" value="${esc(g.title)}" maxlength="60" placeholder="Ej. Leer 12 libros este año"></div>
 <div class="two"><div class="field"><label for="g-cur">Avance actual</label><input class="input" type="number" min="0" step="any" id="g-cur" value="${g.current}"></div><div class="field"><label for="g-target">Objetivo</label><input class="input" type="number" min="1" step="any" id="g-target" value="${g.target}"></div></div>
 <div class="two"><div class="field"><label for="g-unit">Unidad</label><input class="input" type="text" id="g-unit" value="${esc(g.unit||'')}" maxlength="16" placeholder="libros, km…"></div><div class="field"><label for="g-due">Fecha límite</label><input class="input" type="date" id="g-due" value="${esc(g.due||'')}"></div></div>
 <div class="field"><span class="lbl">Color</span>${swatches(g.color||'lav')}</div>
 <div class="actrow" style="margin-top:6px"><button class="btn pri" data-act="saveGoal">Guardar</button>${id?`<button class="btn dng" data-act="delGoal" data-id="${id}">Eliminar</button>`:''}<button class="btn" data-act="closeSheet">Cancelar</button></div>`,'form-goal')}
function sCat(){openSheet(shHead('Nueva categoría')+`<div class="field"><label for="c-name">Nombre</label><input class="input" type="text" id="c-name" maxlength="24" placeholder="Ej. Salud, Finanzas…"></div><div class="actrow" style="margin-top:6px"><button class="btn pri" data-act="saveCat">Crear</button><button class="btn" data-act="closeSheet">Cancelar</button></div>`,'form-cat')}
function sQuote(){openSheet(shHead('Tu frase')+`<div class="field"><label for="q-text">Frase fija</label><textarea class="input" id="q-text" maxlength="160" placeholder="Escribe tu propia frase">${esc(S.settings.quote)}</textarea></div><p class="muted small">Déjala vacía para que rote entre las frases de Configuración.</p><div class="actrow"><button class="btn pri" data-act="saveQuote">Guardar</button><button class="btn" data-act="closeSheet">Cancelar</button></div>`,'form-quote')}
function sExport(){const json=serialize();openSheet(shHead('Exportar copia')+`<p class="muted small" style="margin-bottom:12px">Guarda este archivo en un lugar seguro. Puedes importarlo después en cualquier dispositivo.</p><textarea class="input" id="x-json" readonly rows="6" style="font-family:ui-monospace,Menlo,monospace;font-size:12px">${esc(json)}</textarea><div class="actrow"><button class="btn pri" data-act="downloadFile">${ic('download')}Guardar archivo</button><button class="btn" data-act="copyJson">${ic('copy')}Copiar</button></div>`,'export')}
function impErr(m){const e=$('#i-err');if(!e)return;e.textContent=m;e.hidden=!m}
const IMP_MSG={vacio:'Pega el contenido o elige un archivo primero.',json:'El contenido no es un JSON válido. Revisa que esté completo.',formato:'El JSON no parece una copia de CHAIN (no tiene hábitos).',grande:'El archivo es demasiado grande (máximo 5 MB).'};
function sImport(){openSheet(shHead('Importar copia')+`<div class="note" style="margin-bottom:14px">Importar reemplaza todos los datos actuales. Exporta antes si quieres conservarlos.</div><div class="field"><label for="i-file">Archivo JSON</label><input class="input" type="file" id="i-file" accept=".json,application/json" data-change="importFile"></div><div class="field"><label for="i-json">…o pega el contenido</label><textarea class="input" id="i-json" rows="5" placeholder='{"v":1,…}' aria-describedby="i-err"></textarea><p class="ferr" id="i-err" role="alert" hidden></p></div><div class="actrow" style="margin-top:6px"><button class="btn pri" data-act="doImport">Importar y reemplazar</button><button class="btn" data-act="closeSheet">Cancelar</button></div>`,'import')}

/* ============ acciones ============ */
function toggle(id,date){
 const h=H(id);if(!h)return;date=date||todayS();const was=!!(S.logs[id]&&S.logs[id][date]);const l0=levelOf(xpTotal()).L;
 setLog(h,date,was?0:1);if(!was)ui.just=id;
 if(!was&&date===todayS()){const hs=activeHabits().filter(x=>x.type==='daily'&&x.days.includes(wd(date)));bust();if(hs.length&&hs.every(x=>S.logs[x.id]&&S.logs[x.id][date])&&!S.cel[date]){S.cel[date]=1;toast(pick(DAYDONE));if(hs.length>=2)confetti(50)}}
 bust();checkBadges(true);const l1=levelOf(xpTotal()).L;if(l1>l0&&S.settings.gamify)toast('Subiste al nivel '+l1);
 save();render()}
function cycle(id,date){
 const h=H(id);if(!h||date>todayS())return;const v=(S.logs[id]&&S.logs[id][date])||0;let n;
 if(v===0)n=1;else if(v===1)n=(S.settings.grace&&graceLeft(date.slice(0,7))>0)?2:0;else n=0;
 setLog(h,date,n);bust();checkBadges(true);save();render()}
const actions={
 nav(el){ui.view=el.dataset.v;render()},
 tab(el){ui.tab=el.dataset.t;render()},
 goBreak(){ui.view='habits';ui.tab='break';render()},
 goDay(el){ui.view='calendar';ui.cal.mode='month';ui.cal.anchor=el.dataset.d;ui.cal.sel=el.dataset.d;render()},
 themeToggle(){S.settings.theme=isDark()?'light':'dark';save();render()},
 setTheme(el){S.settings.theme=el.dataset.t;save();render()},
 toggle(el){toggle(el.dataset.id)},
 cell(el){cycle(el.dataset.id,el.dataset.d)},
 openHabit(el){sHabitDetail(el.dataset.id)},
 newHabit(){sHabitForm()},
 editHabit(el){sHabitForm(el.dataset.id)},
 saveHabit,
 dupHabit(el){const h=H(el.dataset.id),c=Object.assign({},h,{id:uid(),name:h.name+' (copia)',created:todayS(),archived:false,days:h.days.slice()});delete c.archivedAt;S.habits.splice(S.habits.indexOf(h)+1,0,c);save();closeSheet();render();toast('Hábito duplicado')},
 archiveHabit(el){const h=H(el.dataset.id);h.archived=true;h.archivedAt=todayS();save();closeSheet();render();toast('Archivado. Tu historial se conserva.')},
 restore(el){const h=H(el.dataset.id);h.archived=false;delete h.archivedAt;save();closeSheet();render();toast('Hábito restaurado')},
 askDelHabit(el){const h=H(el.dataset.id);sConfirm('¿Eliminar este hábito?',`Se borrará «${esc(h.name)}» con todo su historial. Si prefieres conservar los datos, archívalo.`,`<button class="btn dng" data-act="delHabit" data-id="${h.id}">Eliminar</button>${h.archived?'':`<button class="btn" data-act="archiveHabit" data-id="${h.id}">Archivar</button>`}`)},
 delHabit(el){const id=el.dataset.id;S.habits=S.habits.filter(h=>h.id!==id);delete S.logs[id];save();closeSheet();render();toast('Hábito eliminado')},
 mv(el){const list=S.habits.filter(x=>!x.archived&&(ui.cat==='all'||x.cat===ui.cat)),i=list.findIndex(x=>x.id===el.dataset.id),j=i+(+el.dataset.dir);if(j<0||j>=list.length)return;const a=S.habits.indexOf(list[i]),b=S.habits.indexOf(list[j]);[S.habits[a],S.habits[b]]=[S.habits[b],S.habits[a]];save();render()},
 cat(el){ui.cat=el.dataset.c;render()},
 toggleArch(){ui.showArch=!ui.showArch;render()},
 pickColor(el){ui.form.color=el.dataset.c;$$('.sw',$('#sheet')).forEach(b=>b.classList.toggle('on',b===el))},
 pickEmoji(el){$('#f-emoji').value=el.dataset.e;$$('.emj',$('#sheet')).forEach(b=>b.classList.toggle('on',b===el))},
 toggleDay(el){const i=+el.dataset.i,a=ui.form.days,k=a.indexOf(i);if(k>=0)a.splice(k,1);else a.push(i);el.classList.toggle('on',k<0)},
 useGrace(el){const h=H(el.dataset.id),d=el.dataset.d;if(graceLeft(d.slice(0,7))<=0){toast('No quedan comodines este mes');return}setLog(h,d,2);bust();save();render();sHabitDetail(h.id);toast('Comodín usado. Tu cadena sigue.')},
 quickAdd(el){const T={water:['Beber agua','💧','sky'],read:['Leer 20 minutos','📖','lav'],move:['Moverme 30 minutos','🏃','mint'],calm:['Meditar 10 minutos','🧘','rose']}[el.dataset.k];S.habits.push({id:uid(),name:T[0],emoji:T[1],color:T[2],desc:'',cat:'',type:'daily',days:[0,1,2,3,4,5,6],target:1,time:'',created:todayS(),archived:false});save();render();toast('Hábito creado')},
 dismissWarn(el){warn[el.dataset.k]=false;render()},
 closeSheet,
 editQuote:sQuote,
 saveQuote(){S.settings.quote=$('#q-text').value.trim();save();closeSheet();render()},
 nextQuote(){S.settings.quote='';ui.qoff++;save();render()},
 /* calendario */
 calMode(el){ui.cal.mode=el.dataset.m;ui.cal.anchor=todayS();ui.cal.sel=todayS();render()},
 calToday(){ui.cal.anchor=todayS();ui.cal.sel=todayS();render()},
 calNav(el){const R=calRange(),T=todayS();ui.cal.anchor=+el.dataset.dir<0?addDays(R.start,-1):addDays(R.end,1);const N=calRange();ui.cal.sel=(T>=N.start&&T<=N.end)?T:N.start;render()},
 calSel(el){ui.cal.sel=el.dataset.d;render()},
 /* hábitos a dejar */
 newAdd(){sAddForm()},
 editAdd(el){sAddForm(el.dataset.id)},
 saveAdd,
 openAdd(el){sAddDetail(el.dataset.id)},
 newEvent(el){sEventForm(el.dataset.id)},
 pickEv(el){ui.form.type=el.dataset.t;$$('.opt',$('#sheet')).forEach(b=>b.classList.toggle('on',b===el))},
 pickTrig(el){$('#e-trig').value=el.dataset.t},
 saveEvent,
 archiveAdd(el){const a=A(el.dataset.id);a.archived=!a.archived;save();closeSheet();render()},
 askDelAdd(el){const a=A(el.dataset.id);sConfirm('¿Eliminar este objetivo?',`Se borrará «${esc(a.name)}» con su historial de episodios. Si solo quieres pausarlo, archívalo.`,`<button class="btn dng" data-act="delAdd" data-id="${a.id}">Eliminar</button><button class="btn" data-act="archiveAdd" data-id="${a.id}">Archivar</button>`)},
 delAdd(el){S.adds=S.adds.filter(a=>a.id!==el.dataset.id);save();closeSheet();render();toast('Objetivo eliminado')},
 /* metas */
 newGoal(){sGoalForm()},
 editGoal(el){sGoalForm(el.dataset.id)},
 saveGoal(){const t=$('#g-title').value.trim();if(!t){toast('Ponle un título a la meta');return}
  const d={title:t,current:parseFloat($('#g-cur').value)||0,target:Math.max(.0001,parseFloat($('#g-target').value)||1),unit:$('#g-unit').value.trim(),due:$('#g-due').value,color:ui.form.color};
  if(ui.form.id)Object.assign(S.goals.find(g=>g.id===ui.form.id),d);else S.goals.push(Object.assign({id:uid()},d));save();closeSheet();render()},
 delGoal(el){S.goals=S.goals.filter(g=>g.id!==el.dataset.id);save();closeSheet();render()},
 goalStep(el){const g=S.goals.find(x=>x.id===el.dataset.id),was=g.current>=g.target;g.current=Math.max(0,+(g.current+ +el.dataset.n).toFixed(4));if(!was&&g.current>=g.target){toast('Meta lograda: '+g.title);confetti()}save();render()},
 /* categorías y datos */
 newCat:sCat,
 saveCat(){const n=$('#c-name').value.trim();if(!n){toast('Escribe un nombre');return}const c={id:uid(),name:n};S.cats.push(c);ui.cat=c.id;save();closeSheet();render()},
 delCat(el){const id=el.dataset.id;S.cats=S.cats.filter(c=>c.id!==id);S.habits.forEach(h=>{if(h.cat===id)h.cat=''});if(ui.cat===id)ui.cat='all';save();render()},
 openExport:sExport,
 openImport:sImport,
 async downloadFile(){const name='chain-respaldo-'+todayS()+'.json';
  try{
   if(window.claude&&claude.use){const dl=await claude.use('downloads');if(!dl)throw 0;await dl.save({filename:name,data:serialize()});toast('Respaldo guardado');return}
   /* fuera de Claude: descarga directa del navegador */
   const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([serialize()],{type:'application/json'}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);toast('Respaldo descargado')
  }catch(e){if(e&&e.code==='declined')return;toast('No se pudo guardar el archivo. Copia el texto de abajo.')}},
 async copyJson(){const ta=$('#x-json');try{await navigator.clipboard.writeText(ta.value);toast('Copiado')}catch(e){ta.select();toast('Selecciona y copia el texto')}},
 doImport(){const v=$('#i-json').value.trim();let n;
  try{n=deserialize(v)}catch(e){impErr(IMP_MSG[e.message]||'Ese archivo no es una copia válida de CHAIN.');return}   /* si falla, tus datos actuales quedan intactos */
  S=n;S.demo=!!S.demo;bust();checkBadges(false);save();closeSheet();render();toast('Importados '+S.habits.length+' hábitos y sus registros')},
 askReset(){sConfirm('¿Borrar todos tus datos?','Se eliminarán hábitos, registros, objetivos y metas de este dispositivo y de tu cuenta. No se puede deshacer. Considera exportar una copia antes.',`<button class="btn dng" data-act="doReset">Borrar todo</button>`)},
 doReset(){S=blank();ui.cat='all';save();closeSheet();render();toast('Todo borrado. Empieza de nuevo cuando quieras.')},
 startFresh(){const st=S.settings;S=blank();S.settings=st;ui.view='home';ui.ringPrev=null;save();render();toast('Listo. Esta es tu cadena.')}
};
const changes={
 setName(el){S.settings.name=el.value.trim();save();paintFoot()},
 toggle(el){S.settings[el.dataset.k]=el.checked;save();paintFoot()},
 setNum(el){S.settings.graceMonthly=clamp(parseInt(el.value)||0,0,10);el.value=S.settings.graceMonthly;save()},
 setQuotes(el){S.settings.quotes=el.value.split('\n').map(x=>x.trim()).filter(Boolean);save()},
 catName(el){const c=S.cats.find(x=>x.id===el.dataset.id);if(c&&el.value.trim()){c.name=el.value.trim();save()}},
 addNotes(el){A(el.dataset.id).notes=el.value;save()},
 addWhy(el){A(el.dataset.id).why=el.value.trim();save();toast('Motivos guardados')},
 formType(el){$('#w-target').hidden=el.value==='daily';$('#w-days').hidden=el.value!=='daily'},
 importFile(el){const f=el.files&&el.files[0];if(!f)return;if(f.size>5e6){impErr(IMP_MSG.grande);return}
  const r=new FileReader();r.onload=()=>{$('#i-json').value=String(r.result);impErr('')};r.onerror=()=>impErr('No se pudo leer el archivo.');r.readAsText(f)}
};

/* ============ datos de ejemplo ============ */
function mulberry(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function demoState(){
 const s=blank(),T=todayS(),st=addDays(T,-80),R=mulberry(11);s.demo=true;
 const mk=(name,emoji,color,cat,o)=>Object.assign({id:uid(),name,emoji,color,desc:'',cat,type:'daily',days:[0,1,2,3,4,5,6],target:1,time:'',created:st,archived:false},o);
 s.habits=[mk('Meditar 10 minutos','🧘','lav','c2',{time:'07:30',desc:'Respiración y silencio'}),mk('Leer 20 minutos','📖','sky','c2',{time:'22:00'}),mk('Beber 2 litros de agua','💧','mint','c1',{}),mk('Planificar el día','📝','cream','c3',{days:[0,1,2,3,4],time:'08:30'}),mk('Entrenar','💪','rose','c1',{type:'weekly',target:4}),mk('Revisar finanzas','💰','peach','c3',{type:'monthly',target:2})];
 s.habits.forEach((h,k)=>{const L=s.logs[h.id]={};for(let d=st;d<=T;d=addDays(d,1)){const prog=diffDays(st,d)/80,p=h.type==='daily'?.55+.4*prog-k*.02:h.type==='weekly'?.45+.15*prog:.06;
  if(d===T){if(k===0||k===2)L[d]=1;continue}
  if(h.type==='daily'&&!h.days.includes(wd(d)))continue;if(R()<p)L[d]=1}});
 const now=Date.now();
 s.adds=[{id:uid(),name:'Sin scroll nocturno',emoji:'🌙',color:'sky',why:'Quiero dormir mejor y despertar con energía.\nMis noches valen más que cualquier feed.',notes:'',origin:now-40*864e5,start:now-(12*864e5+5*36e5),archived:false,
  events:[{id:uid(),ts:now-(12*864e5+5*36e5),type:'recaida',trigger:'Cansancio',note:'Día largo y sin energía.',prev:27*864e5},{id:uid(),ts:now-5*864e5,type:'desliz',trigger:'Aburrimiento',note:''}]}];
 s.goals=[{id:uid(),title:'Leer 12 libros este año',current:7,target:12,unit:'libros',due:'',color:'sky'},{id:uid(),title:'Correr 100 km',current:62,target:100,unit:'km',due:'',color:'rose'}];
 return s}

/* ============ eventos globales e inicio ============ */
document.addEventListener('click',e=>{
 if(e.target.id==='ov'){closeSheet();return}
 const el=e.target.closest('[data-act]');if(!el)return;const fn=actions[el.dataset.act];if(fn){e.preventDefault();fn(el,e)}});
document.addEventListener('change',e=>{const el=e.target.closest('[data-change]');if(el&&changes[el.dataset.change])changes[el.dataset.change](el,e)});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&ui.sheet){closeSheet();return}
 if((e.key==='Enter'||e.key===' ')&&e.target.getAttribute&&e.target.getAttribute('role')==='button'&&e.target.dataset.act){e.preventDefault();e.target.click()}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(remote.timer);pushRemote()}else rollover()});
function rollover(){if(todayS()!==ui.today){ui.today=todayS();bust();render()}}
(function init(){
 $('#ov').inert=true;
 if(window.matchMedia)matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(S.settings.theme==='system')render()});
 S=loadLocal();if(!S){S=demoState()}
 if(S.demo&&S.settings.theme===undefined)S.settings.theme='system';
 bust();checkBadges(false);render();
 setInterval(tick,1000);setInterval(rollover,30000);
 setTimeout(initRemote,0)})();

/* ============ PRUEBAS AUTOMÁTICAS ============
   Se ejecutan solo con #test en la URL. No tocan tus datos: usan un estado y un almacén en memoria. */
(function(){
 if(!/[#&?]test\b/.test(location.hash+location.search))return;
 const results=[];
 const t=(name,fn)=>{try{fn();results.push({name,ok:true})}catch(e){results.push({name,ok:false,err:String(e&&e.message||e)})}};
 const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error((m||'')+' esperado '+JSON.stringify(b)+', obtenido '+JSON.stringify(a))};
 const ok=(c,m)=>{if(!c)throw new Error(m||'condición falsa')};
 const throws=(fn,msg)=>{let e=null;try{fn()}catch(x){e=x}if(!e)throw new Error('debía fallar');if(msg&&e.message!==msg)throw new Error('error '+e.message+' en vez de '+msg)};
 const withState=fn=>{const s0=S,m0=memo,w0=Object.assign({},warn);try{S=blank();bust();fn()}finally{S=s0;memo=m0;Object.assign(warn,w0);delete window.__chainStore}};
 const mk=o=>{const h=Object.assign({id:uid(),name:'H',type:'daily',days:[0,1,2,3,4,5,6],target:1,color:'lav',emoji:'🎯',created:todayS(),archived:false},o);S.habits.push(h);return h};
 const mark=(h,offs,v)=>{const T=todayS();S.logs[h.id]=S.logs[h.id]||{};offs.forEach(n=>{S.logs[h.id][addDays(T,-n)]=v||1});bust()};
 const memStore=()=>{const m={};return{m,getItem:k=>k in m?m[k]:null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>{delete m[k]}}};

 /* --- fechas --- */
 t('fechas: addDays cruza mes, año bisiesto y cambio de año',()=>{eq(addDays('2026-02-28',1),'2026-03-01');eq(addDays('2028-02-28',1),'2028-02-29');eq(addDays('2026-12-31',1),'2027-01-01');eq(addDays('2026-03-01',-1),'2026-02-28')});
 t('fechas: diffDays',()=>{eq(diffDays('2026-01-01','2026-12-31'),364);eq(diffDays('2026-05-10','2026-05-10'),0)});
 t('periodos: semana de 7 días que contiene la fecha',()=>{const p=periodOf('weekly','2026-11-18');eq(diffDays(p.start,p.end),6);ok(p.start<='2026-11-18'&&p.end>='2026-11-18')});
 t('periodos: quincena de 14 días y mes bisiesto',()=>{const p=periodOf('biweekly','2026-11-18');eq(diffDays(p.start,p.end),13);const m=periodOf('monthly','2028-02-10');eq([m.start,m.end],['2028-02-01','2028-02-29'])});

 /* --- rachas de hábitos --- */
 t('racha: hoy pendiente no corta la racha',()=>withState(()=>{const T=todayS(),h=mk({created:addDays(T,-9)});mark(h,[5,4,3,2,1]);const s=stats(h);eq([s.cur,s.best],[5,5])}));
 t('racha: completar hoy la alarga',()=>withState(()=>{const T=todayS(),h=mk({created:addDays(T,-9)});mark(h,[5,4,3,2,1,0]);eq(stats(h).cur,6)}));
 t('racha: un día perdido la corta, la mejor se conserva',()=>withState(()=>{const T=todayS(),h=mk({created:addDays(T,-9)});mark(h,[8,7,6,5,3,2,1]);const s=stats(h);eq([s.cur,s.best],[3,4])}));
 t('racha: el comodín cubre el día y no suma al total',()=>withState(()=>{const T=todayS(),h=mk({created:addDays(T,-4)});mark(h,[3,1]);mark(h,[2],2);const s=stats(h);eq([s.cur,s.total],[3,2])}));
 t('racha: los días no programados no cuentan como fallo',()=>withState(()=>{const T=todayS(),off=wd(addDays(T,-3)),h=mk({created:addDays(T,-6),days:[0,1,2,3,4,5,6].filter(x=>x!==off)});mark(h,[6,5,4,2,1]);eq(stats(h).cur,5)}));
 t('racha: hábito sin registros → 0 y sin errores',()=>withState(()=>{const h=mk({});const s=stats(h);eq([s.cur,s.best,s.total],[0,0,0])}));
 t('racha semanal: completar la meta del periodo abierto cuenta',()=>withState(()=>{const h=mk({type:'weekly',target:1});mark(h,[0]);const s=stats(h);eq(s.units.length,1);eq(s.cur,1)}));

 /* --- estadísticas globales --- */
 t('día: proporción de hábitos hechos y día sin hábitos',()=>withState(()=>{const T=todayS();eq(dayScore(T).r,null);bust();const a=mk({created:addDays(T,-1)});mk({created:addDays(T,-1)});mark(a,[0]);eq(dayScore(T).r,.5)}));
 t('racha global: días completos consecutivos',()=>withState(()=>{const T=todayS(),a=mk({created:addDays(T,-3)}),b=mk({created:addDays(T,-3)});mark(a,[3,2,1]);mark(b,[3,2,1]);eq(globalStreaks().cur,3);mark(a,[0]);mark(b,[0]);eq(globalStreaks().cur,4)}));
 t('hábitos a dejar: tiempo sin recaer desde el último reinicio',()=>{const d=864e5,a={origin:Date.now()-10*d,events:[{type:'recaida',ts:Date.now()-4*d}]};ok(Math.abs(bestMs(a)-6*d)<2000,'mejor racha ≈ 6 días');const b={origin:Date.now()-10*d,events:[{type:'desliz',ts:Date.now()-4*d}]};ok(Math.abs(bestMs(b)-10*d)<2000,'un desliz no reinicia')});

 /* --- serialización, importación y exportación --- */
 t('packLogs/unpackLogs conservan comodines y día 31',()=>{const l={h1:{'2026-01-31':1,'2026-02-03':2}};eq(unpackLogs(packLogs(l)),l)});
 t('exportar → importar devuelve los mismos datos',()=>withState(()=>{const T=todayS(),h=mk({created:addDays(T,-3),name:'Leer'});mark(h,[2,1],1);mark(h,[3],2);const r=deserialize(serialize()),norm=o=>{const x={};Object.keys(o).sort().forEach(i=>{x[i]={};Object.keys(o[i]).sort().forEach(d=>x[i][d]=o[i][d])});return x};eq(norm(r.logs),norm(S.logs));eq(r.habits.map(x=>x.name),['Leer'])}));
 t('importar rechaza vacío, texto, listas y JSON sin hábitos',()=>{['','   '].forEach(x=>throws(()=>deserialize(x),'vacio'));throws(()=>deserialize('no es json'),'json');['{}','[]','null','{"habits":"x"}'].forEach(x=>throws(()=>deserialize(x),'formato'))});
 t('importar acepta el mínimo válido',()=>{const r=deserialize('{"habits":[]}');eq(r.habits,[]);eq(r.settings.theme,'system')});
 t('importar sanea entradas inválidas sin romper',()=>{const r=deserialize(JSON.stringify({habits:[{id:'a',name:'X'},{name:'sin id'},null,5],logs:{a:{'2026-01-01':1,'mala':1,'2026-01-02':9}},settings:{theme:'rojo'}}));eq(r.habits.length,1);eq(r.logs,{a:{'2026-01-01':1}});eq(r.settings.theme,'system')});

 /* --- persistencia --- */
 t('persistencia: guardar y recargar',()=>withState(()=>{window.__chainStore=memStore();mk({name:'Agua'});save();const r=loadLocal();eq(r.habits.map(h=>h.name),['Agua']);ok(!warn.store)}));
 t('persistencia: cuota llena avisa y se recupera',()=>withState(()=>{const m=memStore();let full=true;window.__chainStore={getItem:m.getItem,setItem:(k,v)=>{if(full)throw new Error('quota');m.setItem(k,v)}};const el=$('#toast'),old=el.textContent;save();ok(warn.store,'debe avisar');full=false;save();ok(!warn.store,'el aviso se retira');el.textContent=old;el.classList.remove('show')}));
 t('persistencia: JSON dañado → copia aparte y estado limpio',()=>withState(()=>{const m=memStore();m.m[KEY]='{rota';window.__chainStore=m;eq(loadLocal(),null);ok(warn.corrupt);eq(m.m[KEY+'.corrupt'],'{rota')}));
 t('persistencia: almacenamiento bloqueado no lanza',()=>withState(()=>{window.__chainStore={getItem(){throw new Error('bloqueado')},setItem(){throw new Error('bloqueado')}};eq(loadLocal(),null);ok(warn.store)}));

 /* --- accesibilidad: contraste WCAG AA en ambos temas --- */
 const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4));return .2126*c[0]+.7152*c[1]+.0722*c[2]};
 const cr=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 ['light','dark'].forEach(th=>t('contraste AA (≥4.5) en tema '+th,()=>{
  const R=document.documentElement,prev=R.getAttribute('data-theme');R.setAttribute('data-theme',th);
  try{const cs=getComputedStyle(R),v=n=>cs.getPropertyValue('--'+n).trim();
   [['ink','bg'],['ink','surface'],['ink2','surface'],['ink2','surface2'],['ink3','surface'],['ink3','bg'],['ink3','surface2'],['accent-ink','accent'],['accent','surface'],['bad','surface'],['good','surface']].forEach(([a,b])=>{
    ok(/^#[0-9a-f]{6}$/i.test(v(a))&&/^#[0-9a-f]{6}$/i.test(v(b)),'token no hex: '+a+'/'+b);
    const r=cr(v(a),v(b));if(r<4.5)throw new Error('--'+a+' sobre --'+b+' = '+r.toFixed(2))})}
  finally{if(prev)R.setAttribute('data-theme',prev);else R.removeAttribute('data-theme')}}));

 const pass=results.filter(r=>r.ok).length,fail=results.length-pass;
 window.__chainTests={pass,fail,results};
 console[fail?'error':'log']('CHAIN pruebas: '+pass+' ok, '+fail+' fallan');results.filter(r=>!r.ok).forEach(r=>console.error('✗ '+r.name+' — '+r.err));
 const p=document.createElement('section');p.id='chain-test-report';p.setAttribute('role','region');p.setAttribute('aria-label','Resultados de pruebas');
 p.style.cssText='position:fixed;right:12px;bottom:12px;z-index:200;max-width:min(520px,calc(100vw - 24px));max-height:70vh;overflow:auto;padding:14px 16px;border-radius:16px;background:var(--surface);color:var(--ink);border:1px solid var(--line2);box-shadow:var(--sh2);font-size:13px';
 p.innerHTML='<b style="color:'+(fail?'var(--bad)':'var(--good)')+'">Pruebas: '+pass+' correctas'+(fail?' · '+fail+' fallan':'')+'</b><ul style="margin:8px 0 0;padding-left:18px">'+results.map(r=>'<li>'+(r.ok?'✓ ':'✗ ')+esc(r.name)+(r.ok?'':' — '+esc(r.err))+'</li>').join('')+'</ul>';
 document.body.appendChild(p);
})();

/* ---- instalación y modo sin conexión ---- */
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol))window.addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js').catch(()=>{}));
