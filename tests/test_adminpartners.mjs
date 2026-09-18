/* Admin partner-applications inbox — the tightened list and signed detail bar.
 *
 * Behaviour of Accept / org matching / mailto / Firestore writes is unchanged;
 * these assertions cover the page loading, filtering, and the three-band panel.
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
  {id:'NoWeb9999xxxx',reference:'PA-2026-NOWB',companyName:'Silent Hosting',
   contactName:'Ada Lim',email:'ada@silent.example',phone:'+639179999999',
   website:'',supportTypes:['venue'],message:'',
   source:'success_page',status:'declined',eventId:'2026-10-ai-exchange',
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
async function openAdmin(viewport){
  const p=await ctx.newPage();
  if(viewport) await p.setViewportSize(viewport);
  p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub}));
  await p.route('**/firebasejs/12.19.0/firebase-app.js',r=>r.fulfill({contentType:'text/javascript',body:appStub}));
  await p.route('**/firebasejs/12.19.0/firebase-firestore.js',r=>r.fulfill({contentType:'text/javascript',body:firestoreStub}));
  await p.goto(`${BASE}/admin-partners.html`,{waitUntil:'load'});
  await p.waitForSelector('[data-open]',{timeout:9000});
  return p;
}

await T('the page loads the list without the gaps card or placeholder search',async()=>{
  const p=await openAdmin();
  eq(await p.locator('[data-open]').count(),3,'three applications');
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
  eq(await p.locator('[data-copy]').evaluate(e=>getComputedStyle(e).fontSize),'12px','Copy is 12px');
  await p.close();
});

await T('the signed bar is three bands, one Offering heading, status on the title line',async()=>{
  const p=await openAdmin();
  await p.locator('[data-open="AbCd1234efgh"]').click();
  const d=p.locator('[data-detail]');
  eq(await d.locator('[data-band]').count(),3,'three bands');
  eq(await d.locator('[data-band]').evaluateAll(els=>els.map(e=>e.dataset.band)),
     ['application','offering','decision'],'application, offering, decision');
  eq(await d.locator('.ehead').count(),1,'not six eheads');
  eq((await d.locator('.ehead').evaluate(e=>e.textContent)).trim(),'Offering','the one heading');
  ok(await d.locator('.papp-title .pill').count(),'status pill on the company line');
  eq(await d.locator('.dmeta .pill').count(),0,'no separate status row');
  const css=readFileSync(`${ROOT}/assets/css/paaipe-admin.css`,'utf8');
  const partner=css.split('/* ================================================= partner applications ===')[1];
  ok(/\.papp-band \+ \.papp-band\{[^}]*border-top:1px solid var\(--line\)/.test(partner),
     'bands split by 1px var(--line)');
  ok(/\.papp-band \+ \.papp-band\{[^}]*16px/.test(partner),'bands split by 16px');
  ok(/\.papp-decision\{[^}]*border-radius:12px/.test(partner),'decision radius 12');
  ok(/\.papp-decision\{[^}]*padding:14px 16px/.test(partner),'decision padding 14 16');
  await p.close();
});

await T('contact stays two columns; empty website omits the cell and the dash',async()=>{
  const p=await openAdmin();
  await p.locator('[data-open="AbCd1234efgh"]').click();
  const d=p.locator('[data-detail]');
  const cols=await d.locator('.answers').evaluate(el=>getComputedStyle(el).gridTemplateColumns);
  ok(cols.split(/\s+/).filter(Boolean).length===2,`contact grid is two columns (${cols})`);
  eq(await d.locator('.answers .ans').count(),4,'website present when set');
  const contact=await d.locator('.answers .ans').nth(0).boundingBox();
  const email=await d.locator('.answers .ans').nth(1).boundingBox();
  const mobile=await d.locator('.answers .ans').nth(2).boundingBox();
  ok(contact&&email&&mobile,'contact cells laid out');
  ok(Math.abs(contact.y-email.y)<4,'Contact and Email share a row');
  ok(Math.abs(mobile.y-contact.y)>8,'Mobile is the next row');
  const emailH=await d.locator('.answers .ans').nth(1).locator('dd').boundingBox();
  const phoneH=await d.locator('.phone-inline').boundingBox();
  ok(emailH&&phoneH,'email and phone measured');
  ok(Math.abs(phoneH.height-emailH.height)<6,
     `Copy must not change the row height (phone ${phoneH.height}px vs email ${emailH.height}px)`);
  await p.locator('[data-close]').click();
  await p.locator('[data-open="NoWeb9999xxxx"]').click();
  const dts=await d.locator('.answers dt').evaluateAll(els=>els.map(e=>e.textContent.trim()));
  eq(dts,['Contact','Email','Mobile'],'no Website cell when empty');
  const dashes=await d.locator('.answers dd').evaluateAll(els=>els.map(e=>e.textContent.trim()));
  ok(!dashes.includes('—'),'no dash for a missing website');
  await p.close();
});

await T('Save note is ghost; Accept is the only gold button',async()=>{
  const p=await openAdmin();
  await p.locator('[data-open="AbCd1234efgh"]').click();
  const d=p.locator('[data-detail]');
  const gold=await d.locator('.btn-gold').evaluateAll(els=>els.map(e=>({
    accept:e.hasAttribute('data-accept'),save:e.hasAttribute('data-save-note'),
    text:e.textContent.replace(/\s+/g,' ').trim()})));
  eq(gold.length,1,'one gold control');
  ok(gold[0].accept,'that gold control is Accept');
  eq(gold[0].text,'Accept — add as Partner (proposed)','Accept label unchanged');
  const save=d.locator('[data-save-note]');
  ok(await save.evaluate(e=>e.classList.contains('btn-ghost')),'Save note is ghost');
  ok(await save.evaluate(e=>!e.classList.contains('btn-gold')),'Save note is not gold');
  ok(await d.locator('[data-status="declined"]').evaluate(e=>e.classList.contains('danger')),
     'Decline is danger');
  ok(await d.locator('[data-status="spam"]').evaluate(e=>e.classList.contains('danger')),
     'spam stays danger');
  const mail=d.locator('.papp-mail');
  eq(await mail.locator('[data-mail]').count(),3,'mailto templates on one line');
  const hint=await mail.locator('.muted').boundingBox();
  const last=await mail.locator('[data-mail]').last().boundingBox();
  ok(hint&&last,'mail hint and last template laid out');
  ok(Math.abs(hint.y-last.y)<10,'Opens your mail app sits on the mail line');
  ok(hint.x>last.x,'hint at the end of that line');
  await p.close();
});

await T('no console errors',()=>ok(errs.length===0,errs.join(' | ')));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
