/* What a visitor is allowed to see and do, decided by the event RECORD.
 *
 * The defect this exists to prevent: an event that is not open for registration
 * still showing "Register now", because the page's HTML says so and nothing
 * checked. That shipped once. A draft is the same failure with worse
 * consequences — it is not public at all, and the form would have taken the
 * sign-up.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const BASE=process.env.PAAIPE_BASE||'http://127.0.0.1:8899', ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
const REAL_FB=readFileSync(`${ROOT}/assets/js/paaipe-firebase.js`,'utf8');
const REAL_DATA=readFileSync(`${ROOT}/assets/js/paaipe-events-data.js`,'utf8');
const RULES=readFileSync(`${ROOT}/firestore.rules`,'utf8');
let pass=0,fail=0;
const T=async(n,f)=>{try{await f();console.log(`  PASS  ${n}`);pass++}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++}};
const ok=(c,m)=>{if(!c)throw new Error(m)};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)};

const EV={id:'2026-10-ai-exchange',slug:'event-2026-10-ai-exchange',title:'AI Exchange — October 2026',
  status:'registration_open',date:'2026-10-13',timezone:'Asia/Manila'};
const ORGS=[{id:'gethired',name:'GetHired Online',website:'https://gethired.ph',status:'active',logoUrl:'assets/img/partners/logo-gethired.png'}];

const fbStub=`export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return null}`;
const dataStub=({ev=EV,sponsors=[],notFound=false,throws=false}={})=>`
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function getEventBySlug(){ ${throws?"throw new Error('offline');":''}
    return ${notFound?'null':JSON.stringify(ev)} }
  export async function listEvents(){ return ${notFound?'[]':`[${JSON.stringify(ev)}]`} }
  export async function listOrganizations(){ return ${JSON.stringify(ORGS)} }
  export async function listEventSponsors(){ return ${JSON.stringify(sponsors)} }
  export async function myApplications(){ return new Map() }`;

const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:1280,height:1000}});
const errs=[];
async function open(opts={}){
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub(opts)}));
  await p.goto(`${BASE}/event-2026-10-ai-exchange.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-event-view]',{timeout:9000});
  return p;
}
const cta=p=>p.locator('[data-register-cta]');

/* ------------------------------------------------- the Register button */

await T('an OPEN event offers a real Register link',async()=>{
  const p=await open();
  eq(await p.locator('[data-register-cta] a').count(),1,'a real anchor');
  ok(/register-2026-10/.test(await p.locator('[data-register-cta] a').getAttribute('href')),'to the form');
  await p.close();
});

await T('every status that is NOT open refuses, and says which it is',async()=>{
  // The exact words a visitor reads, from registrationState().
  const cases={published:'opens soon',registration_closed:'Registration closed',
               held:'taken place',cancelled:'cancelled'};
  for(const [status,word] of Object.entries(cases)){
    const p=await open({ev:{...EV,status}});
    eq(await p.locator('[data-register-cta] a').count(),0,`${status}: must not offer a live link`);
    const t=await cta(p).innerText();
    ok(new RegExp(word,'i').test(t),`${status}: should say "${word}", said "${t}"`);
    ok(await p.locator('[data-cta-closed]').count()===1,`${status}: a disabled label, not a button`);
    await p.close();
  }
});

await T('a HELD event does not invite registration on any page',async()=>{
  const p=await open({ev:{...EV,status:'held'}});
  eq(await p.locator('[data-register-cta] a').count(),0,'no way to register for a past event');
  ok(/taken place/i.test(await cta(p).innerText()),'and it should say so');
  await p.close();
});

await T('BREAK-CHECK: the button follows the STATUS, not the markup',async()=>{
  // The page's HTML is byte-identical in both runs. Only the record differs.
  const a=await open({ev:{...EV,status:'registration_open'}});
  const openText=await cta(a).innerText(); await a.close();
  const b=await open({ev:{...EV,status:'cancelled'}});
  const shutText=await cta(b).innerText(); await b.close();
  ok(openText!==shutText,`the same HTML must produce two different CTAs, got "${openText}" twice`);
  ok(/Register/i.test(openText)&&!/Register now/i.test(shutText),'and only one of them invites a sign-up');
});

/* --------------------------------------------------- a draft, and offline */

await T('AN UNPUBLISHED EVENT MUST NOT GO ON TAKING SIGN-UPS',async()=>{
  // Returning early here was a real bug: the page kept whatever its HTML said,
  // and the HTML says "Register now".
  const p=await open({notFound:true});
  eq(await p.getAttribute('html','data-event-view'),'not-found','the page knows');
  eq(await p.locator('[data-register-cta] a').count(),0,'and offers no way in');
  ok(/not available/i.test(await cta(p).innerText()),'saying so plainly');
  eq(await p.getAttribute('[data-register-cta]','data-cta-state'),'not-found','with the reason recorded');
  await p.close();
});

await T('a draft also loses its sponsors and its pictures',async()=>{
  const p=await open({notFound:true});
  ok(!(await p.locator('[data-sponsors]').isVisible()),'no sponsor logos');
  ok(!(await p.locator('[data-gallery-mount]').isVisible()),'no photos');
  await p.close();
});

await T('OFFLINE is different from NOT PUBLIC, and keeps the page intact',async()=>{
  // A network failure must never blank an event page - it is the page people
  // are trying to read to find out when to turn up.
  const p=await open({throws:true});
  eq(await p.getAttribute('html','data-event-view'),'offline','recorded as offline');
  const t=await cta(p).innerText();
  ok(/Register/i.test(t),`the markup's own CTA survives a network fault: "${t}"`);
  await p.close();
});

/* ----------------------------------------------------------- sponsors */

await T('a CONFIRMED sponsor appears publicly',async()=>{
  const p=await open({sponsors:[{id:'s1',eventId:EV.id,organizationId:'gethired',tier:'presenting',
    status:'confirmed',organization:ORGS[0]}]});
  ok(await p.locator('[data-sponsors]').isVisible(),'the block is shown');
  ok(await p.locator('[data-sponsors] img[alt*="GetHired"]').count(),'named on the logo');
  eq(await p.locator('[data-sponsors] img').count(),1,'with its logo');
  await p.close();
});

await T('no confirmed sponsor means no empty box',async()=>{
  const p=await open({sponsors:[]});
  ok(!(await p.locator('[data-sponsors]').isVisible()),
     'no sponsor is a fact, not an error, and not an empty box');
  await p.close();
});

await T('a partner logo links to the partner, never to "#"',async()=>{
  // The mockup linked every logo to "#", so four partners who agreed to be
  // credited got a dead link each.
  const p=await open({sponsors:[{id:'s1',eventId:EV.id,organizationId:'gethired',tier:'presenting',
    status:'confirmed',organization:ORGS[0]}]});
  const href=await p.locator('[data-sponsors] a').first().getAttribute('href');
  eq(href,'https://gethired.ph','the organization\'s own site');
  ok(await p.locator('[data-sponsors] a[href="#"]').count()===0,'and never a dead link');
  await p.close();
});

/* ------------------------------------------- the boundary is the rules */

await T('the rules refuse a DRAFT to the public, which is the real boundary',()=>{
  const b=RULES.slice(RULES.indexOf('match /paaipe_events/'),RULES.indexOf('match /paaipe_event_private/'));
  ok(/allow read: if isAdmin\(\) \|\| \(resource\.data\.status is string/.test(b),'conditional read');
  ok(/status != 'draft'/.test(b),'and a draft is what it refuses');
});

await T('the rules refuse a PROPOSED sponsorship to the public',()=>{
  const b=RULES.slice(RULES.indexOf('match /paaipe_event_sponsors/'));
  ok(/in \['confirmed','delivered'\]/.test(b),
     'a proposal is a conversation PAAIPE is having, not a fact about the world');
});

await T('the Zoom link is a separate document no client may read',()=>{
  const b=RULES.slice(RULES.indexOf('match /paaipe_event_private/'),RULES.indexOf('match /paaipe_event_sponsors/'));
  ok(/allow read: if isAdmin\(\)/.test(b),'admin only');
  // Name the THING, not the word: "zoom" also appears in `cursor:zoom-in`,
  // which is a mouse pointer and not a meeting link.
  const view=readFileSync(`${ROOT}/assets/js/paaipe-event-view.js`,'utf8');
  ok(!/event_private|zoomLink|zoom_url|joinUrl/i.test(view),
     'the public view must never read the private document or a join link');
  const data=readFileSync(`${ROOT}/assets/js/paaipe-events-data.js`,'utf8');
  ok(!/COL\.[a-z]*private/i.test(data),'and the shared data layer offers no way to');
});

await T('the public list asks only for statuses it may read',()=>{
  // A conditional rule does not filter a list, it refuses the whole query.
  const data=readFileSync(`${ROOT}/assets/js/paaipe-events-data.js`,'utf8');
  ok(/PUBLIC_EVENT_STATUSES/.test(data),'the constraint exists');
  ok(!/PUBLIC_EVENT_STATUSES\s*=\s*\[[^\]]*draft/.test(data),'and never includes draft');
  ok(/RULES DO NOT FILTER A LIST/i.test(data),'with the reason written down');
});

await T("September's recap link resolves to Resources, and is never \"#\"",()=>{
  const s=readFileSync(`${ROOT}/event-2026-09-ai-exchange.html`,'utf8');
  const m=/<a[^>]*data-members-only[^>]*>([^<]*)</.exec(s);
  ok(m,'the recap link is present and marked members-only');
  ok(/href="resources\.html"/.test(m[0]),'the markup still points there');
  ok(!/href="#"/.test(m[0]),'never a dead link');
  ok(/data-members-label="[^"]+"/.test(m[0]),'and it carries the label it changes to');
});

await T('no console errors',()=>ok(errs.length===0,errs.join(' | ')));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
