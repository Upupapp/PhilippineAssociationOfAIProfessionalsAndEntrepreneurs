/* Event Email tab: this session's registrants, branded preview, honest stub. */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
const BASE=process.env.PAAIPE_BASE||'http://127.0.0.1:8899', ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
const REAL_FB=readFileSync(`${ROOT}/assets/js/paaipe-firebase.js`,'utf8');
const REAL_DATA=readFileSync(`${ROOT}/assets/js/paaipe-events-data.js`,'utf8');
const REAL_API=readFileSync(`${ROOT}/assets/js/paaipe-api.js`,'utf8');
let pass=0,fail=0;
const T=async(n,f)=>{try{await f();console.log(`  PASS  ${n}`);pass++}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++}};
const ok=(c,m)=>{if(!c)throw new Error(m)};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)};

const EV={id:'e-oct',slug:'event-2026-10-ai-exchange',title:'AI Exchange — October 2026',
  status:'registration_open',date:'2026-10-13',startTime:'20:00',endTime:'21:30',capacity:500,
  timezone:'Asia/Manila'};
const REGS=[
  {id:'r1',eventId:'e-oct',full_name:'Ada Registered',email:'ada@x.com',status:'registered'},
  {id:'r2',eventId:'e-oct',full_name:'Ben Attended',email:'ben@x.com',status:'attended'},
  {id:'r3',eventId:'e-oct',full_name:'Cara Noshow',email:'cara@x.com',status:'no_show'},
  {id:'r4',eventId:'e-oct',full_name:'Dan Cancelled',email:'dan@x.com',status:'cancelled'},
  {id:'r5',eventId:'e-nov',full_name:'Eve Other',email:'eve@x.com',status:'registered'},
];

const fbStub=`export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return {uid:'a1',email:'admin@upupapp.asia',status:'guest'}}
  export async function isAdminNow(){return true}
  export async function signOutNow(){}
  export async function idTokenForRequest(){ return 'test-id-token' }`;
const dataStub=`
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function listEvents(){ return ${JSON.stringify([EV])} }
  export async function listOrganizations(){ return [] }
  export async function listEventSponsors(){ return [] }
  export async function listPartnerApplicationsFor(){ return [] }
  export async function listAllRegistrations(){ return ${JSON.stringify(REGS)} }`;
const apiStub=`
  export * from '/assets/js/paaipe-api-real.js';
  export async function listAdminEvents(){ return ${JSON.stringify([EV])} }`;

const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:1440,height:1100}});
const errs=[];
async function open(){
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub}));
  await p.route('**/assets/js/paaipe-api-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_API}));
  await p.route('**/assets/js/paaipe-api.js',r=>r.fulfill({contentType:'text/javascript',body:apiStub}));
  await p.goto(`${BASE}/admin-events.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-admin-events]',{timeout:9000});
  await p.click('tr[data-event="e-oct"] [data-edit-event]');
  await p.waitForSelector('[data-event-tabs] button',{timeout:9000});
  await p.evaluate(()=>localStorage.removeItem('paaipe.event-email.v1.e-oct'));
  await p.click('[data-tab="email"]');
  await p.waitForSelector('[data-email-body]',{timeout:9000});
  return p;
}

await T('official marks live under assets/email and are not file://',()=>{
  ok(existsSync(`${ROOT}/assets/email/logo-mark-header.png`),'header mark');
  ok(existsSync(`${ROOT}/assets/email/logo-mark-email.png`),'signature mark');
  const js=readFileSync(`${ROOT}/assets/js/paaipe-email-shell.js`,'utf8');
  ok(js.includes('https://paaipe.org/assets/email/logo-mark-header.png'),'canonical header URL');
  ok(js.includes('https://paaipe.org/assets/email/logo-mark-email.png'),'canonical signature URL');
  const assets=js.slice(js.indexOf('export const EMAIL_ASSETS'), js.indexOf('export const DEFAULT_BODY_HTML'));
  ok(!/file:\/\//.test(assets),'asset URLs are not file://');
});

await T('the shell keeps the official brand colours',async()=>{
  const p=await open();
  const html=await p.evaluate(async()=>{
    const m=await import('/assets/js/paaipe-email-shell.js');
    return m.wrapEmailHtml('<p>Hello from a session</p>',{subject:'Test'});
  });
  ok(/#0E3A8C/.test(html),'header navy');
  ok(/#00C0FC/.test(html),'cyan wordmark');
  ok(/#FCA800/.test(html),'gold rule');
  ok(/#0B1A33/.test(html),'footer');
  ok(/agent@paaipe.org/.test(html),'from address in the letter');
  ok(/https:\/\/paaipe.org\/assets\/email\/logo-mark-header.png/.test(html),'header mark on paaipe.org');
  ok(!/file:\/\//.test(html),'no file:// in the letter');
  await p.close();
});

await T('Email sits after Registrations and before Feedback',async()=>{
  const p=await open();
  const keys=await p.$$eval('[data-event-tabs] button',b=>b.map(x=>x.dataset.tab));
  eq(keys,['details','media','sponsors','applications','registrations','email','feedback','reports','settings'],'order');
  await p.close();
});

await T('From is locked to agent@paaipe.org',async()=>{
  const p=await open();
  const v=await p.locator('.email-locked input').inputValue();
  eq(v,'agent@paaipe.org','from');
  ok(await p.locator('.email-locked input').evaluate(el=>el.readOnly),'readonly');
  await p.close();
});

await T('audience is this event only, cancelled opt-in, All registered is the default',async()=>{
  const p=await open();
  const n=await p.locator('[data-email-count]').innerText();
  eq(n.trim(),'3','registered+attended+no-show, not cancelled, not the other event');
  const r=await p.evaluate(async(regs)=>{
    const m=await import('/assets/js/paaipe-event-email.js');
    const mine=regs.filter(x=>x.eventId==='e-oct');
    return {
      all: m.audienceOf(mine,{mode:'all_registered'}).map(x=>x.email),
      withC: m.audienceOf(mine,{mode:'all_registered',includeCancelled:true}).map(x=>x.email),
      att: m.audienceOf(mine,{mode:'attended'}).map(x=>x.email),
    };
  }, REGS);
  eq(r.all,['ada@x.com','ben@x.com','cara@x.com'],'default excludes cancelled');
  eq(r.withC,['ada@x.com','ben@x.com','cara@x.com','dan@x.com'],'cancelled only when chosen');
  eq(r.att,['ben@x.com'],'attended chip');
  await p.close();
});

await T('clicking Cancelled adds them; Attended is just attended',async()=>{
  const p=await open();
  await p.click('[data-email-mode="attended"]');
  eq((await p.locator('[data-email-count]').innerText()).trim(),'1','attended');
  await p.click('[data-email-cancelled]');
  eq((await p.locator('[data-email-count]').innerText()).trim(),'2','attended + cancelled');
  await p.close();
});

await T('empty session points at Registrations and does not invent a Zoom resend',async()=>{
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:`
    export * from '/assets/js/paaipe-events-data-real.js';
    export async function listEvents(){ return ${JSON.stringify([EV])} }
    export async function listOrganizations(){ return [] }
    export async function listEventSponsors(){ return [] }
    export async function listPartnerApplicationsFor(){ return [] }
    export async function listAllRegistrations(){ return [] }`}));
  await p.route('**/assets/js/paaipe-api-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_API}));
  await p.route('**/assets/js/paaipe-api.js',r=>r.fulfill({contentType:'text/javascript',body:apiStub}));
  await p.goto(`${BASE}/admin-events.html`,{waitUntil:'load'});
  await p.click('tr[data-event="e-oct"] [data-edit-event]');
  await p.click('[data-tab="email"]');
  await p.waitForSelector('[data-email-empty]',{timeout:9000});
  ok(await p.locator('[data-email-goto-regs]').isVisible(),'link to Registrations');
  ok(await p.locator('[data-email-confirm]').isDisabled(),'cannot send to nobody');
  const t=await p.locator('[data-tabpanel="email"]').innerText();
  ok(!/zoom/i.test(t),'no fake Zoom resend');
  await p.click('[data-email-goto-regs]');
  ok(await p.locator('[data-tabpanel="registrations"]').isVisible(),'landed on Registrations');
  await p.close();
});

await T('Preview renders branded HTML, not the plain compose text',async()=>{
  const p=await open();
  await p.fill('[data-email-subject]','October session note');
  await p.click('[data-email-preview]');
  const frame=p.frameLocator('[data-email-modal="preview"] iframe');
  await frame.locator('body').waitFor({timeout:9000});
  const html=await p.locator('[data-email-modal="preview"] iframe').evaluate(el=>el.getAttribute('srcdoc'));
  ok(/#0E3A8C/.test(html),'header in the iframe');
  ok(/PAAIPE Agent/.test(html),'signature');
  ok(/Official channels/.test(html),'footer');
  ok(/Dear Maria/.test(html)||/Dear \[Name\]/.test(html)||/Maria/.test(html),'body inside the shell');
  const vis=await frame.locator('td[style*="#0E3A8C"], td[style*="background-color:#0E3A8C"]').count();
  ok(vis>0,'header cell is in the rendered letter');
  await p.close();
});

await T('Save draft persists locally; Send / Schedule / test do not fake success',async()=>{
  const p=await open();
  await p.fill('[data-email-subject]','Saved session draft');
  await p.click('[data-email-save]');
  ok(/Draft saved/i.test(await p.locator('[data-flash]').innerText()),'saved');
  await p.click('[data-email-view="history"]');
  ok(await p.getByText('Saved session draft').isVisible(),'history row');
  await p.click('[data-email-view="compose"]');
  await p.click('[data-email-confirm]');
  await p.waitForSelector('[data-email-modal="confirm"]');
  ok(await p.locator('[data-email-do-send]').isDisabled(),'confirm action is disabled');
  ok(/not wired/i.test(await p.locator('[data-email-modal="confirm"]').innerText()),'honest copy in confirm');
  await p.click('[data-email-close]');
  await p.click('[data-email-test]');
  ok(/not wired/i.test(await p.locator('[data-flash]').innerText()),'test send is honest');
  const hist=await p.evaluate(()=>JSON.parse(localStorage.getItem('paaipe.event-email.v1.e-oct')));
  ok(hist.items.every(x=>x.status==='draft'),'nothing marked sent');
  await p.close();
});

await T('schedule display is Asia/Manila',async()=>{
  const p=await open();
  ok(await p.getByText('Asia/Manila').count().then(n=>n>0),'tz on the compose rail');
  await p.click('[data-email-timing="schedule"]');
  ok(await p.locator('[data-email-when]').isVisible(),'datetime in Manila');
  const html=readFileSync(`${ROOT}/assets/js/paaipe-email-shell.js`,'utf8');
  ok(html.includes('Asia/Manila'),'formatter tz');
  ok(html.includes('+08:00'),'parse as Philippine offset');
  await p.close();
});

await T('the Email tab hides the event Publish rail',async()=>{
  const p=await open();
  ok(!(await p.locator('[data-publish-rail]').isVisible()),'publish rail gone on Email');
  await p.click('[data-tab="details"]');
  ok(await p.locator('[data-publish-rail] [data-save-event]').isVisible(),'and comes back');
  await p.close();
});

await T('no console errors',()=>ok(errs.length===0,errs.join(' | ')));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
