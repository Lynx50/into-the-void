// Run: node --experimental-strip-types tests/session-recovery.test.mjs
// Exercises the real API/session module. Browser storage, transport and Vite env are controlled.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
const apiUrl = new URL('../src/lib/api.ts',import.meta.url);
const hooks=registerHooks({load(url,context,next){
 if(url===apiUrl.href){return {format:'module-typescript',source:readFileSync(apiUrl,'utf8').replace('import.meta.env.VITE_API_BASE_URL','undefined'),shortCircuit:true};}
 return next(url,context);
}});
const storage=new Map();
globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
const api=await import(apiUrl.href);
const session=(token)=>({userId:'synthetic-owner',sessionToken:token});
const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
let requests=[];
globalThis.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));
const failures=[];
async function check(name,fn){storage.clear();requests=[];try{await fn();console.log('PASS',name);}catch(e){failures.push(name+': '+e.message);}}
async function denied(request){request.resolve(response(401,{error:'Session expired'}));}
await check('late old-session 401 preserves replacement token',async()=>{
 api.storeAnonymousSession(session('expired-token'));
 const old=api.apiFetch('/thoughts/my').catch(e=>e);
 assert.equal(requests[0].options.headers.get('x-void-session'),'expired-token');
 api.storeAnonymousSession(session('replacement-token'));
 await denied(requests[0]);assert.equal((await old).status,401);
 assert.equal(api.getStoredAnonymousSession()?.sessionToken,'replacement-token');
});
await check('late request without a token cannot erase a new session',async()=>{
 const old=api.apiFetch('/thoughts/my').catch(e=>e);
 api.storeAnonymousSession(session('replacement-token'));
 await denied(requests[0]);await old;
 assert.equal(api.getStoredAnonymousSession()?.sessionToken,'replacement-token');
});
await check('explicit older request header cannot erase replacement token',async()=>{
 api.storeAnonymousSession(session('replacement-token'));
 const old=api.apiFetch('/thoughts/my',{headers:{'x-void-session':'expired-token'}}).catch(e=>e);
 await denied(requests[0]);await old;
 assert.equal(api.getStoredAnonymousSession()?.sessionToken,'replacement-token');
});
await check('current-token 401 still invalidates failed session',async()=>{
 api.storeAnonymousSession(session('expired-token'));
 const old=api.apiFetch('/thoughts/my').catch(e=>e);
 await denied(requests[0]);await old;
 assert.equal(api.getStoredAnonymousSession(),null);
 assert.equal(storage.get('void_user_id'),'synthetic-owner');
});
await check('session endpoint 401 never clears current token',async()=>{
 api.storeAnonymousSession(session('replacement-token'));
 const old=api.apiFetch('/session',undefined,{skipSession:true}).catch(e=>e);
 await denied(requests[0]);await old;
 assert.equal(api.getStoredAnonymousSession()?.sessionToken,'replacement-token');
});
await check('following action sends replacement token after stale 401',async()=>{
 api.storeAnonymousSession(session('expired-token'));
 const old=api.apiFetch('/thoughts/my').catch(e=>e);
 api.storeAnonymousSession(session('replacement-token'));
 await denied(requests[0]);await old;
 const next=api.apiFetch('/thoughts/receive',{method:'POST',body:JSON.stringify({userId:'synthetic-owner'})});
 const sent=requests[1].options.headers.get('x-void-session');requests[1].resolve(response(200,{id:123}));await next;
 assert.equal(sent,'replacement-token');
});
await check('force initialization still replaces a current token',async()=>{
 api.storeAnonymousSession(session('expired-token'));
 const refreshed=api.initializeAnonymousSession(true);
 assert.equal(api.getStoredAnonymousSession(),null);
 assert.equal(JSON.parse(requests[0].options.body).userId,'synthetic-owner');
 assert.equal(requests[0].options.headers.get('x-void-session'),null);
 requests[0].resolve(response(200,session('replacement-token')));await refreshed;
 assert.equal(api.getStoredAnonymousSession()?.sessionToken,'replacement-token');
});
await check('completed reconnect survives earlier background request rejection',async()=>{
 api.storeAnonymousSession(session('expired-token'));
 const old=api.apiFetch('/thoughts/my').catch(e=>e);
 const refresh=api.initializeAnonymousSession(true);
 assert.equal(requests.length,2);
 requests[1].resolve(response(200,session('replacement-token')));
 await refresh;
 await denied(requests[0]);await old;
 const restored=await api.initializeAnonymousSession(false);
 assert.equal(restored.sessionToken,'replacement-token');
 assert.equal(requests.length,2,'No automatic replay or unnecessary extra session request');
});
await check('offline error preserves session and does not dispatch',async()=>{
 api.storeAnonymousSession(session('replacement-token'));
 navigator.onLine=false;
 try {
  const error=await api.apiFetch('/thoughts/receive',{method:'POST'}).catch(e=>e);
  assert.equal(error.status,0);assert.equal(requests.length,0);
  assert.equal(api.getStoredAnonymousSession()?.sessionToken,'replacement-token');
 } finally {navigator.onLine=true;}
});
hooks.deregister();assert.deepEqual(failures,[]);console.log('All session-recovery cases passed; no real network or credentials used.');
