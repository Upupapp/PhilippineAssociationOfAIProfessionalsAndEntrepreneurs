/* Offering column: many support types must wrap as separate pills, not overlap.
 *
 * The publish-rail .chip is an inline padded span (cursor:pointer, no display).
 * Dumping those into a <td> lets the label wrap mid-pill and paint over its
 * neighbours. Compact .tag boxes inside a flex .tags wrap are the fix, on both
 * the event Applications tab and the Partner applications inbox.
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

const EV={id:'2026-10-ai-exchange',slug:'event-2026-10-ai-exchange',title:'AI Exchange — October 2026',
  status:'registration_open',date:'2026-10-13',startTime:'20:00',endTime:'21:30',capacity:500,
  timezone:'Asia/Manila'};
const APPS=[
  {id:'AbCd1234efgh',reference:'PA-2026-DADJ',companyName:'test',contactName:'Admin UpUp Tech',
   email:'admin@upupapp.asia',supportTypes:['speaker','vouchers','venue','media','other'],
   status:'new',source:'public_event',eventId:EV.id,isSample:false,
   createdAt:{seconds:1750000000},consentAt:{seconds:1750000000}},
  {id:'RuleSample01',reference:'PA-2026-RULE',companyName:'Rules verification',contactName:'Automated check',
   email:'check@example.com',supportTypes:['other'],status:'new',source:'public_event',
   eventId:EV.id,isSample:true,createdAt:{seconds:1750000001},consentAt:{seconds:1750000001}},
];
const LABELS=['A speaker or session','Vouchers or credits for attendees','A venue',
              'Media or promotion','Something else'];

const fbStub=`export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return {uid:'a1',email:'admin@upupapp.asia',status:'guest'}}
  export async function isAdminNow(){return true}
  export async function signOutNow(){}
  export async function countNewPartnerApplications(){return 2}`;

const dataStub=`
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function listEvents(){ return ${JSON.stringify([EV])} }
  export async function listOrganizations(){ return [] }
  export async function listEventSponsors(){ return [] }
  export async function listPartnerApplicationsFor(){ return ${JSON.stringify(APPS)} }
  export async function listAllRegistrations(){ return [] }`;

const firestoreStub=`
  const docs=${JSON.stringify(APPS)}.map(a=>({id:a.id,data:()=>{const {id,...rest}=a;return rest}}));
  export function getFirestore(){return {}}
  export function collection(){return {}}
  export function doc(){return {}}
  export function query(col){return col}
  export function where(){return {}}
  export function getDocs(){return Promise.resolve({docs})}
  export function getDoc(){return Promise.resolve({exists:()=>false,data:()=>({})})}
  export function addDoc(){return Promise.resolve()}
  export function serverTimestamp(){return {}}
  export function getCountFromServer(){return Promise.resolve({data:()=>({count:docs.length})})}
`;
const appStub=`
  export function initializeApp(){return {name:'paaipe'}}
  export function getApps(){return [{name:'paaipe'}]}
`;

function overlapArea(a,b){
  const x=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x));
  const y=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  return x*y;
}

async function tagBoxes(row){
  return row.locator('.tag').evaluateAll(els=>els.map(e=>{
    const r=e.getBoundingClientRect();
    return {x:r.x,y:r.y,w:r.width,h:r.height,t:e.textContent.trim(),
            cursor:getComputedStyle(e).cursor,display:getComputedStyle(e).display};
  }));
}

function assertNoOverlap(boxes,where){
  ok(boxes.length>=2,`${where}: need several tags, got ${boxes.length}`);
  for(let i=0;i<boxes.length;i++){
    for(let j=i+1;j<boxes.length;j++){
      const area=overlapArea(boxes[i],boxes[j]);
      ok(area<1,`${where}: "${boxes[i].t}" overlaps "${boxes[j].t}" by ${area}px²`);
    }
  }
}

const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:1280,height:900}});
const errs=[];

async function stub(p){
  p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub}));
  await p.route('**/firebasejs/**/firebase-firestore.js',r=>r.fulfill({contentType:'text/javascript',body:firestoreStub}));
  await p.route('**/firebasejs/**/firebase-app.js',r=>r.fulfill({contentType:'text/javascript',body:appStub}));
}

await T('markup uses .tag inside .tags, not the publish-rail .chip',()=>{
  const events=readFileSync(`${ROOT}/assets/js/paaipe-admin-events.js`,'utf8');
  const partners=readFileSync(`${ROOT}/assets/js/paaipe-admin-partners.js`,'utf8');
  const appsFn=events.slice(events.indexOf('function renderApplicationsTab'),
                            events.indexOf('async function loadApplicationsTab'));
  ok(/class="tags"/.test(appsFn)&&/class="tag"/.test(appsFn),'event Applications tab');
  ok(!/class="chip"/.test(appsFn),'event tab must not reuse .chip for offerings');
  const offer=partners.slice(partners.indexOf('function offeringChips'),
                             partners.indexOf('function renderTally'));
  ok(/class="tags"/.test(offer)&&/class="tag"/.test(offer),'inbox offeringChips');
  ok(!/class="chip"/.test(offer),'inbox must not reuse .chip for offerings');
  const rail=events.slice(events.indexOf('function renderRail'),events.indexOf('function renderRail')+900);
  ok(/button class="chip/.test(rail),'publish-rail toggles stay .chip buttons');
});

await T('CSS: .tag is a wrapping box; .chip stays a clickable toggle',()=>{
  const css=readFileSync(`${ROOT}/assets/css/paaipe-admin.css`,'utf8');
  ok(/\.tags\{[^}]*display:flex/.test(css.replace(/\s+/g,' '))
     && /\.tags\{[^}]*flex-wrap:wrap/.test(css.replace(/\s+/g,' ')),'.tags wraps');
  ok(/\.tag\{[^}]*display:inline-flex/.test(css.replace(/\s+/g,' ')),'.tag is a box');
  ok(/\.tag\{[^}]*cursor:default/.test(css.replace(/\s+/g,' ')),'.tag is not clickable-looking');
  ok(/\.chip\{[^}]*cursor:pointer/.test(css.replace(/\s+/g,' ')),'.chip toggles stay pointer');
});

await T('Applications tab: five offerings wrap without overlapping',async()=>{
  const p=await ctx.newPage();
  await stub(p);
  await p.goto(`${BASE}/admin-events.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-admin-events]',{timeout:9000});
  await p.click(`tr[data-event="${EV.id}"] [data-edit-event]`);
  await p.waitForSelector('[data-event-tabs] button',{timeout:9000});
  await p.click('[data-tab="applications"]');
  await p.waitForSelector('[data-tabpanel="applications"] .tags .tag',{timeout:9000});
  const row=p.locator('[data-tabpanel="applications"] tbody tr',{hasText:'PA-2026-DADJ'});
  const boxes=await tagBoxes(row);
  eq(boxes.map(b=>b.t),LABELS,'every support type is still shown');
  assertNoOverlap(boxes,'event Applications');
  ok(boxes.every(b=>b.display==='inline-flex'),'each offering is a box, not an inline span');
  ok(boxes.every(b=>b.cursor==='default'),'offerings are not pointer');
  const wrap=await row.locator('.tags').evaluate(el=>{
    const r=el.getBoundingClientRect();
    const s=getComputedStyle(el);
    return {display:s.display,wrap:s.flexWrap,overflow:s.overflow,w:r.width,h:r.height};
  });
  eq(wrap.display,'flex','container is flex');
  eq(wrap.wrap,'wrap','container wraps');
  const totalW=boxes.reduce((s,b)=>s+b.w,0)+5*(boxes.length-1);
  const ys=[...new Set(boxes.map(b=>Math.round(b.y)))];
  if(totalW>wrap.w+1) ok(ys.length>=2,'tags that do not fit one row must wrap, not overlap');
  ok(wrap.h+0.5>=Math.max(...boxes.map(b=>b.h)),'row height grows with the chips, nothing clipped');
  ok(!/hidden/.test(wrap.overflow),'the cell does not clip wrapped tags');
  ok(await p.locator('[data-publish-rail] button.chip.on').isVisible(),
     'publish-rail .chip toggle is unchanged');
  await p.screenshot({path:'/tmp/offering-chips-event-applications.png'});
  await p.close();
});

await T('Partner applications inbox: the same column does not overlap',async()=>{
  const p=await ctx.newPage();
  await stub(p);
  await p.goto(`${BASE}/admin-partners.html`,{waitUntil:'load'});
  await p.waitForSelector('[data-admin-partners]',{timeout:9000});
  await p.waitForSelector('[data-rows] .tags .tag',{timeout:9000});
  const row=p.locator('[data-rows] tr',{hasText:'PA-2026-DADJ'});
  const boxes=await tagBoxes(row);
  eq(boxes.map(b=>b.t),LABELS,'inbox shows the same labels');
  assertNoOverlap(boxes,'partner inbox');
  const one=await tagBoxes(p.locator('[data-rows] tr',{hasText:'PA-2026-RULE'}));
  eq(one.map(b=>b.t),['Something else'],'a single offering still renders');
  await p.locator('[data-open="AbCd1234efgh"]').click();
  const detail=p.locator('[data-detail]');
  await detail.waitFor({state:'visible'});
  const dBoxes=await tagBoxes(detail);
  eq(dBoxes.map(b=>b.t),LABELS,'detail panel uses the same tags');
  assertNoOverlap(dBoxes,'inbox detail');
  ok(!(await detail.locator('.chips .chip').count()),
     'detail must not paint offerings as publish-rail chips');
  await p.screenshot({path:'/tmp/offering-chips-partner-inbox.png'});
  await p.close();
});

await T('no console errors',()=>ok(errs.length===0,errs.join(' | ')));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
