// Run with Node 24+: node --experimental-strip-types tests/analytics-mutation.test.mjs
// Real hook callbacks and analytics wrapper; native bridge/query client are isolated doubles.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const root = new URL('../src/', import.meta.url);
const data = source => 'data:text/javascript,' + encodeURIComponent(source);
let calls = [];
let nativeMode = 'pending';
let nativeCalls = [];
let rejectNative;
let native = true;
globalThis.__analyticsMutationTest = {
  native: () => native,
  logEvent: (event) => {
    nativeCalls.push(event);
    if (nativeMode === 'success') return Promise.resolve();
    return new Promise((_resolve, reject) => { rejectNative = reject; });
  },
  queryClient: {
    invalidateQueries: async options => { calls.push(['invalidate', options]); },
    refetchQueries: async options => { calls.push(['refetch', options]); },
    setQueryData: (key, update) => { calls.push(['set', key]); return update(undefined); },
  },
};
const storage = new Map();
globalThis.localStorage = {getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
const hooks = registerHooks({resolve(specifier, context, next) {
  const stubs = {
    '@tanstack/react-query': 'export const useMutation=x=>x; export const useQuery=x=>x; export const useQueryClient=()=>globalThis.__analyticsMutationTest.queryClient;',
    '@/lib/api': 'export const apiFetch=()=>{throw Error("Network forbidden")}; export const initializeAnonymousSession=async()=>({userId:"test-user"}); export const warmBackendConnection=async()=>{};',
    '@capacitor/core': 'export const Capacitor={isNativePlatform:()=>globalThis.__analyticsMutationTest.native()};',
    '@capacitor-firebase/analytics': 'export const FirebaseAnalytics={logEvent:e=>globalThis.__analyticsMutationTest.logEvent(e)};',
  };
  if (specifier in stubs) return {url:data(stubs[specifier]),shortCircuit:true};
  if (specifier==='@/lib/analytics') return {url:new URL('lib/analytics.ts',root).href,shortCircuit:true};
  if (specifier==='./use-user') return {url:data('export const useUser=()=>({userId:"test-user",isReady:true});'),shortCircuit:true};
  return next(specifier,context);
}});
const module = await import(new URL('hooks/use-thoughts.ts',root));
const cases = [
 ['release',module.useSubmitThought,{}, {data:{mood:'calm'}}],
 ['receive',module.useReceiveThought,{id:1,mood:'calm'},{data:{userId:'test-user'}}],
 ['claim',module.useClaimReceivedThought,{id:2,mood:null},{data:{userId:'test-user'}}],
 ['react',module.useReactToThought,{}, {data:{reactionType:'felt_this'}}],
];
let failures=[];
const oldError=console.error;
console.error=()=>{};
try {
 for (const [name,hook,result,variables] of cases) {
  calls=[];nativeCalls=[];nativeMode='pending';native=true;
  let done=false;
  const callback=hook().onSuccess(result,variables).then(()=>{done=true;});
  // A complete event-loop turn, with no wall-clock sleep, distinguishes native wait from query work.
  await new Promise(setImmediate);
  try {
   assert.equal(done,true,`${name}: success must finish while telemetry remains pending`);
   assert.equal(nativeCalls.length,1);
   if(name==='release') assert.deepEqual(calls.map(c=>c[0]),['invalidate','invalidate','refetch']);
   if(name==='receive'||name==='claim') assert.deepEqual(calls.map(c=>c[0]),['set','invalidate']);
   assert.ok(!JSON.stringify(nativeCalls).includes('test-user'),'No user ID in event');
  } catch(e){failures.push(e.message);}
  rejectNative(new Error('Synthetic bridge rejection'));
  await callback;
 }
 for (const nativeState of [false,true]) {
  native=nativeState;nativeMode='success';nativeCalls=[];
  await module.useSubmitThought().onSuccess({}, {data:{mood:null}});
  assert.equal(nativeCalls.length,nativeState?1:0);
 }
} finally { console.error=oldError; hooks.deregister(); delete globalThis.__analyticsMutationTest; }
assert.deepEqual(failures,[]);
console.log('PASS: four real mutation callbacks remain responsive with pending/rejected native analytics; native-success and web controls pass');
