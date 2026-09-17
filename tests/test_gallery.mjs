/* The event's pictures on the public page, from the record. */
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
  status:'registration_open',date:'2026-10-13',timezone:'Asia/Manila'};
const SHOTS=[{url:'assets/img/world-dots.png',alt:'The room filling up',caption:'Doors at 7:30',order:0},
             {url:'assets/img/paaipe-logo.png',alt:'Sven presenting',caption:'',order:1},
             {url:'assets/img/ai-exchange-cover.png',alt:'Q and A',caption:'Questions ran long',order:2}];

const fbStub=`export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return null}`;
const dataStub=ev=>`
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function listEvents(){ return [${JSON.stringify(ev)}] }
  export async function getEventBySlug(){ return ${JSON.stringify(ev)} }
  export async function listOrganizations(){ return [] }
  export async function listEventSponsors(){ return [] }
  export async function myApplications(){ return new Map() }`;

const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:1280,height:1000}});
const errs=[];
async function open(ev=EV){
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub(ev)}));
  await p.goto(`${BASE}/event-2026-10-ai-exchange.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-gallery]',{timeout:9000});
  return p;
}

await T('with no photos the section is hidden entirely, not shown empty',async()=>{
  const p=await open();
  eq(await p.getAttribute('html','data-gallery'),'0','none');
  ok(!(await p.locator('[data-gallery-mount]').isVisible()),
     'an empty gallery is not a thing to show');
  await p.close();
});

await T('the photos on the record are rendered, in order',async()=>{
  const p=await open({...EV,gallery:SHOTS});
  eq(await p.getAttribute('html','data-gallery'),'3','three');
  eq(await p.locator('[data-ph-open]').count(),3,'three figures');
  eq(await p.locator('[data-ph-open]').first().getAttribute('aria-label'),
     'The room filling up — open larger','first, by order');
  ok(/Photos/.test(await p.locator('[data-gallery-mount]').innerText()),'with a heading');
  await p.close();
});

await T('order is the RECORD\'s order, not the order they happen to be stored in',async()=>{
  const p=await open({...EV,gallery:[{...SHOTS[2],order:0},{...SHOTS[0],order:1},{...SHOTS[1],order:2}]});
  const alts=await p.$$eval('[data-ph-open] img',i=>i.map(x=>x.alt));
  eq(alts,['Q and A','The room filling up','Sven presenting'],'sorted by order');
  await p.close();
});

await T('a photo with no alt text is left OUT, not shown unlabelled',async()=>{
  const p=await open({...EV,gallery:[SHOTS[0],{url:'x.png',alt:'',caption:'no alt'},SHOTS[1]]});
  eq(await p.locator('[data-ph-open]').count(),2,
     'a photo nobody using a screen reader can identify is not published, it is just present');
  ok(!/no alt/.test(await p.locator('[data-gallery-mount]').innerText()),'and its caption goes too');
  await p.close();
});

await T('never more than five, however many the record carries',async()=>{
  const many=[0,1,2,3,4,5,6].map(i=>({url:`assets/img/paaipe-logo.png`,alt:`Photo ${i}`,order:i}));
  const p=await open({...EV,gallery:many});
  eq(await p.locator('[data-ph-open]').count(),5,
     'the limit is enforced where it is RENDERED too, not only in the form');
  await p.close();
});

await T('captions show, and a photo without one simply has none',async()=>{
  const p=await open({...EV,gallery:SHOTS});
  eq(await p.locator('[data-ph-open] figcaption').count(),2,'two of the three have captions');
  ok(/Doors at 7:30/.test(await p.locator('[data-gallery-mount]').innerText()),'the caption text');
  await p.close();
});

await T('a photo opens a lightbox, and Escape closes it',async()=>{
  const p=await open({...EV,gallery:SHOTS});
  await p.locator('[data-ph-open]').first().click();
  await p.waitForSelector('dialog.plb[open]',{timeout:5000});
  eq(await p.locator('dialog.plb img').getAttribute('alt'),'The room filling up','the one clicked');
  ok(/Doors at 7:30/.test(await p.locator('dialog.plb').innerText()),'with its caption');
  await p.keyboard.press('Escape');
  await p.waitForSelector('dialog.plb',{state:'detached',timeout:5000});
  await p.close();
});

await T('the lightbox moves with the arrow keys and wraps',async()=>{
  const p=await open({...EV,gallery:SHOTS});
  await p.locator('[data-ph-open]').first().click();
  await p.waitForSelector('dialog.plb[open]',{timeout:5000});
  await p.keyboard.press('ArrowRight');
  eq(await p.locator('dialog.plb img').getAttribute('alt'),'Sven presenting','forward');
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft');
  eq(await p.locator('dialog.plb img').getAttribute('alt'),'Q and A','back past the start wraps');
  await p.close();
});

await T('a keyboard visitor can open it, and gets focus back on the way out',async()=>{
  const p=await open({...EV,gallery:SHOTS});
  const fig=p.locator('[data-ph-open]').nth(1);
  await fig.focus();
  await p.keyboard.press('Enter');
  await p.waitForSelector('dialog.plb[open]',{timeout:5000});
  await p.keyboard.press('Escape');
  await p.waitForSelector('dialog.plb',{state:'detached',timeout:5000});
  eq(await p.evaluate(()=>document.activeElement?.getAttribute('data-ph-open')),'1',
     'dropping them at the top of the page would be the accessibility bug');
  await p.close();
});

await T('the cover comes from the record, and falls back to the wide banner',async()=>{
  const a=await open({...EV,coverUrl:'assets/img/ai-exchange-cover.png',bannerWideUrl:'assets/img/world-dots.png'});
  eq(await a.locator('[data-cover] img').getAttribute('src'),'assets/img/ai-exchange-cover.png','coverUrl wins');
  await a.close();
  const b=await open({...EV,bannerWideUrl:'assets/img/world-dots.png'});
  eq(await b.locator('[data-cover] img').getAttribute('src'),'assets/img/world-dots.png','falls back to wide');
  await b.close();
});

await T('no picture on the record must NOT blank a page that already had one',async()=>{
  const p=await open(EV);
  const src=await p.locator('[data-cover] img').getAttribute('src');
  ok(src && /ai-exchange-2026-10-banner-wide/.test(src),
     `the markup's own cover must survive an empty record: ${src}`);
  await p.close();
});

await T('an event that is not public shows no pictures either',async()=>{
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:`
    export * from '/assets/js/paaipe-events-data-real.js';
    export async function listEvents(){ return [] }
    export async function getEventBySlug(){ return null }
    export async function listOrganizations(){ return [] }
    export async function listEventSponsors(){ return [] }
    export async function myApplications(){ return new Map() }`}));
  await p.goto(`${BASE}/event-2026-10-ai-exchange.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-event-view="not-found"]',{timeout:9000});
  ok(!(await p.locator('[data-gallery-mount]').isVisible()),'a draft keeps its pictures too');
  await p.close();
});

/* og:image is read by crawlers that do not run JavaScript. Writing it from the
 * browser changes nothing a sharer sees, while looking exactly as if it worked. */
await T('the share card is NOT written from JavaScript, and the code says why',()=>{
  const js=readFileSync(`${ROOT}/assets/js/paaipe-event-view.js`,'utf8');
  ok(!/og:image/.test(js.replace(/\/\*[\s\S]*?\*\//g,'')),
     'no code outside the comments may touch og:image');
  ok(/do not run JavaScript/i.test(js),'and the reason is written down');
  const admin=readFileSync(`${ROOT}/assets/js/paaipe-admin-events.js`,'utf8');
  ok(/og:image/.test(admin)&&/crawlers/i.test(admin),
     'the Media tab tells the admin what to paste instead');
});

await T('every event page carries the mount and a marked cover',()=>{
  for(const m of ['09','10','11','12']){
    const s=readFileSync(`${ROOT}/event-2026-${m}-ai-exchange.html`,'utf8');
    ok(/data-gallery-mount/.test(s),`${m}: no gallery mount`);
    ok(/class="cover[^"]*" data-cover/.test(s),`${m}: cover not marked`);
  }
});

await T('no console errors',()=>ok(errs.length===0,errs.join(' | ')));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
