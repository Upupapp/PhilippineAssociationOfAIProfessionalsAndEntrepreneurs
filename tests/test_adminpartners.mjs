/* Admin partner-applications inbox — the tightened list/detail UI.
 *
 * Behaviour of Accept / org matching / mailto / Firestore writes is unchanged;
 * these assertions cover the page loading, filtering, and the compact panel.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const BASE=process.env.PAAIPE_BASE||'http://127.0.0.1:8899', ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
const REAL_FB=readFileSync(`${ROOT}/assets/js/paaipe-firebase.js`,'utf8');
const REAL_DATA=readFileSync(`${ROOT}/assets/js/paaipe-events-data.js`,'utf8');
let pass=0,fail=0;
const T=async(n,f)=>{try{await f();console.log(`  PASS  ${n}`);pass++}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++}};
const ok=(c,m)=>{if(!c)throw new Error(m)};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)};

const EVENTS=[
  {id:'2026-10-ai-exchange',title:'AI Exchange — October 2026',status:'registration_open'},
  {id:'2026-11-ai-exchange',title:'AI Exchange — November 2026',status:'published'},
];
const ORGS=[{id:'gethired',name:'GetHired Online',website:'https://gethired.ph',status:'active'}];
const AT={seconds:1758067200};
const APPS=[
  {id:'AbCd1234efgh',reference:'PA-2026-ABCD',companyName:'Northwind Analytics',
   contactName:'Rosa Villanueva',email:'rosa@example.com',phone:'+639171234567',
   website:'northwind.example.com',supportTypes:['speaker','vouchers'],
   message:'We can put up a speaker.',source:'public_event',status:'new',
   eventId:'2026-10-ai-exchange',createdAt:AT,consentAt:AT,privacyVersion:'1.0'},
  {id:'GhIj5678klmn',reference:'PA-2026-GHIJ',companyName:'GetHired Online',
   contactName:'Pat Cruz',email:'pat@gethired.ph',phone:'+639171111111',
   website:'https://gethired.ph',supportTypes:['media'],message:'',
   source:'events_list',status:'contacted',eventId:'2026-11-ai-exchange',
   createdAt:AT,consentAt:AT,privacyVersion:'1.0'},
];

const fbStub=`
  export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return {uid:'u1',email:'admin@upupapp.asia',full_name:'Admin',status:'agent'}}
  export async function isAdminNow(){return true}
  export async function signOutNow(){}`;
const dataStub=`
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function listEvents(){ return ${JSON.stringify(EVENTS)} }
  export async function listOrganizations(){ return ${JSON.stringify(ORGS)} }
  export async function listEventSponsors(){ return [] }`;
const firestoreStub=`
  const APPS=${JSON.stringify(APPS)};
  window.__writes=[];
  export function getFirestore(){ return {} }
  export function collection(db,name){ return { _col:name } }
  export function doc(db,col,id){ return { path:(col||'')+'/'+(id||''), id:id||'x' } }
  export async function getDocs(col){
    const rows=col._col==='paaipe_partner_applications'?APPS:[];
    return { docs: rows.map(a=>{ const {id,...data}=a; return { id, data:()=>data }; }) };
  }
  export async function setDoc(ref,data,opts){ window.__writes.push({op:'set',ref,data,opts}); }
  export async function addDoc(col,data){ window.__writes.push({op:'add',col,data}); return {id:'new'}; }
  export function serverTimestamp(){ return { _sv:true } }`;
const appStub=`
  const apps=[];
  export function initializeApp(c,n){ const a={name:n||'[DEFAULT]',options:c}; apps.push(a); return a }
  export function getApps(){ return apps }`;

const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:1280,height:900}});
const errs=[];
async function openAdmin(viewport, path='admin-partners.html'){
  const p=await ctx.newPage();
  if(viewport) await p.setViewportSize(viewport);
  p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub}));
  await p.route('**/firebasejs/12.19.0/firebase-app.js',r=>r.fulfill({contentType:'text/javascript',body:appStub}));
  await p.route('**/firebasejs/12.19.0/firebase-firestore.js',r=>r.fulfill({contentType:'text/javascript',body:firestoreStub}));
  await p.goto(`${BASE}/${path}`,{waitUntil:'load'});
  await p.waitForSelector('[data-open]',{timeout:9000});
  return p;
}
const qs=p=>{
  const u=new URL(p.url());
  return {id:u.searchParams.get('id'),event:u.searchParams.get('event'),path:u.pathname};
};

await T('the page loads the list without the gaps card or placeholder search',async()=>{
  const p=await openAdmin();
  eq(await p.locator('[data-open]').count(),2,'both applications');
  ok(!(await p.locator('.top .search').isVisible()),'placeholder search is hidden');
  const body=await p.locator('body').innerText();
  ok(!/What this screen cannot do yet/i.test(body),'gaps card gone');
  ok(!/Search is not built yet/i.test(body),'placeholder copy gone');
  ok(!/no mail sender wired/i.test(body),'no long mail essay');
  eq(await p.locator('h1').innerText(),'Partner applications','one page title');
  eq(await p.locator('h2').count(),0,'no repeated card heading');
  eq(await p.locator('[data-crumbs]').count(),0,'no crumb title');
  await p.close();
});

await T('status, source and search filters narrow the list',async()=>{
  const p=await openAdmin();
  await p.selectOption('[data-f-status]','new');
  eq(await p.locator('[data-open]').count(),1,'new only');
  ok(/Northwind/.test(await p.locator('[data-rows]').innerText()),'the new one');
  await p.selectOption('[data-f-status]','');
  await p.selectOption('[data-f-source]','events_list');
  eq(await p.locator('[data-open]').count(),1,'source filter');
  ok(/GetHired/.test(await p.locator('[data-rows]').innerText()),'from the list');
  await p.selectOption('[data-f-source]','');
  await p.locator('[data-f-q]').fill('rosa@');
  eq(await p.locator('[data-open]').count(),1,'search by email');
  ok(/Northwind/.test(await p.locator('[data-rows]').innerText()),'Rosa\'s company');
  await p.close();
});

await T('opening a row shows a compact detail panel',async()=>{
  const p=await openAdmin();
  await p.locator('[data-open="AbCd1234efgh"]').click();
  const d=p.locator('[data-detail]');
  ok(await d.isVisible(),'detail shown');
  const t=await d.innerText();
  ok(/Northwind Analytics/.test(t),'company');
  ok(/PA-2026-ABCD/.test(t),'reference');
  ok(/Opens your mail app/.test(t),'short mail line');
  ok(/Accept creates a proposed Partner/.test(t),'short decision line');
  ok(/Check the match before accepting/.test(t),'short org line');
  ok(!/These open your own mail app/i.test(t),'old mail essay gone');
  ok(!/Accepting does not publish anything/i.test(t),'old decision essay gone');
  eq(await d.locator('[data-note]').getAttribute('rows'),'2','note is two rows');
  eq(await d.locator('[data-link-org]').count(),1,'org picker unchanged');
  eq(await d.locator('[data-accept]').count(),1,'accept unchanged');
  eq(await d.locator('[data-mail]').count(),3,'mailto templates unchanged');
  await p.locator('[data-close]').click();
  ok(await d.isHidden(),'close hides it');
  await p.close();
});

await T('Copy sits inline next to the phone, including on a narrow viewport',async()=>{
  const p=await openAdmin({width:390,height:800});
  await p.locator('[data-open="AbCd1234efgh"]').click();
  const phone=await p.locator('[data-detail] a[href^="tel:"]').boundingBox();
  const copy=await p.locator('[data-copy]').boundingBox();
  ok(phone&&copy,'both are laid out');
  ok(Math.abs(copy.y-phone.y)<6,`Copy must share the phone row (phone y=${phone.y}, copy y=${copy.y})`);
  ok(copy.width<140,`Copy must not be a full-width control (${copy.width}px)`);
  await p.close();
});

await T('opening a row writes the application id into the URL without reloading',async()=>{
  const p=await openAdmin();
  let loads=0;
  p.on('load',()=>{loads++});
  eq(qs(p).id,null,'list URL has no id');
  await p.locator('[data-open="AbCd1234efgh"]').click();
  ok(await p.locator('[data-detail]').isVisible(),'detail shown');
  eq(qs(p).id,'AbCd1234efgh','id is in the address');
  eq(loads,0,'pushState, not a navigation');
  await p.close();
});

await T('reload with that URL reopens the same application',async()=>{
  const p=await openAdmin(null,'admin-partners.html?id=AbCd1234efgh');
  const d=p.locator('[data-detail]');
  ok(await d.isVisible(),'detail shown from the URL');
  ok(/Northwind Analytics/.test(await d.innerText()),'the named application');
  eq(qs(p).id,'AbCd1234efgh','address unchanged');
  await p.reload({waitUntil:'load'});
  await p.waitForSelector('[data-open]',{timeout:9000});
  ok(await p.locator('[data-detail]').isVisible(),'still open after reload');
  ok(/Northwind Analytics/.test(await p.locator('[data-detail]').innerText()),'same company');
  eq(qs(p).id,'AbCd1234efgh','id survived reload');
  await p.close();
});

await T('close and Back restore the list URL, keeping ?event=',async()=>{
  const p=await openAdmin(null,'admin-partners.html?event=2026-10-ai-exchange');
  eq(await p.locator('[data-open]').count(),1,'event filter still applies');
  eq(qs(p).event,'2026-10-ai-exchange','event is in the address');
  await p.locator('[data-open="AbCd1234efgh"]').click();
  eq(qs(p).id,'AbCd1234efgh','id added');
  eq(qs(p).event,'2026-10-ai-exchange','event kept on open');

  await p.goBack({waitUntil:'commit'});
  await p.waitForFunction(()=>!new URL(location.href).searchParams.get('id'));
  ok(await p.locator('[data-detail]').isHidden(),'Back hides the panel');
  eq(qs(p).id,null,'Back restores the list URL');
  eq(qs(p).event,'2026-10-ai-exchange','event still there after Back');

  await p.locator('[data-open="AbCd1234efgh"]').click();
  eq(qs(p).id,'AbCd1234efgh','open again');
  await p.locator('[data-close]').click();
  ok(await p.locator('[data-detail]').isHidden(),'close hides it');
  eq(qs(p).id,null,'close drops the id');
  eq(qs(p).event,'2026-10-ai-exchange','and keeps the event filter');
  await p.close();
});

await T('an id that is not in the loaded list is named, not a blank panel',async()=>{
  const p=await openAdmin(null,'admin-partners.html?id=not-a-real-app');
  const d=p.locator('[data-detail]');
  ok(await d.isVisible(),'the panel is shown');
  const t=await d.innerText();
  ok(/not-a-real-app/.test(t),'it names the id from the URL');
  ok(/not in the loaded list/i.test(t),'and says why it is empty');
  eq(await d.locator('[data-accept]').count(),0,'it is not a blank application record');
  await p.locator('[data-close]').click();
  ok(await d.isHidden(),'close still works');
  eq(qs(p).id,null,'and returns to the list URL');
  await p.close();
});

await T('no console errors',()=>ok(errs.length===0,errs.join(' | ')));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
