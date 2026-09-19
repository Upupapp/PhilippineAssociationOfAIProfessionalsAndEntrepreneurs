/* Portal Home entry popup — signed UI, per-user persist, four existing routes. */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
const BASE=process.env.PAAIPE_BASE||'http://127.0.0.1:8899', ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
const REAL_FB=readFileSync(`${ROOT}/assets/js/paaipe-firebase.js`,'utf8');
let pass=0,fail=0;
const T=async(n,f)=>{try{await f();console.log(`  PASS  ${n}`);pass++}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++}};
const ok=(c,m)=>{if(!c)throw new Error(m)};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)};

const fbStub=({signedIn=true,uid='u1',status='agent',email='rosa@example.com',name='Rosa Villanueva',configured=true}={})=>`
  export * from '/assets/js/paaipe-firebase-real.js';
  export function isConfigured(){return ${configured}}
  export async function currentAgent(){return ${signedIn}?{
    uid:'${uid}', email:'${email}', full_name:'${name}', status:'${status}',
    isAgent:${status==='agent'}, emailVerified:true, directoryVisible:false,
    agentNumber:${status==='agent'?'"0006"':'null'}, confirmationSeen:true
  }:null}`;

const br=await chromium.launch();
const errs=[];
async function open(opts={}){
  const ctx=await br.newContext({viewport:opts.viewport||{width:1280,height:900}});
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub(opts.fb||{})}));
  if(opts.stored){
    await ctx.addInitScript(values=>{
      for(const [uid,choice] of Object.entries(values)){
        localStorage.setItem('paaipe.entry-popup.v1:'+uid, JSON.stringify({choice,at:'2026-09-18T00:00:00.000Z'}));
      }
    }, opts.stored);
  }
  await p.goto(`${BASE}/${opts.page||'portal.html'}`,{waitUntil:'load'});
  return {p,ctx};
}

const TITLE='Where do you want to start?';
const LEAD='Four ways in. Pick the one that matches why you opened the portal. You can switch anytime.';
const FOOT='Members start in Learnings. Organizations start in My Organization.';

await T('Home wires the popup module; other portal pages do not',()=>{
  const home=readFileSync(`${ROOT}/portal.html`,'utf8');
  ok(home.includes('data-page="portal-home"'),'home marker');
  ok(home.includes('paaipe-entry-popup.js'),'script on Home');
  ok(home.includes('paaipe-entry-popup.css'),'signed CSS on Home');
  for(const page of ['portal-events.html','portal-sessions.html','portal-organization.html','portal-profile.html','index.html']){
    const h=readFileSync(`${ROOT}/${page}`,'utf8');
    ok(!h.includes('paaipe-entry-popup.js'),`${page} must not load the popup`);
  }
});

await T('public site stays Poppins and has no entry popup',()=>{
  const h=readFileSync(`${ROOT}/index.html`,'utf8');
  ok(/family=Poppins/.test(h),'Poppins font');
  ok(/font-family:Poppins/.test(h),'Poppins body');
  ok(!/paaipe-entry-popup/.test(h),'no popup on public Home');
});

await T('destinations already exist — no second My Organization page',()=>{
  ok(existsSync(`${ROOT}/portal-sessions.html`),'Learnings / sessions hub');
  ok(existsSync(`${ROOT}/portal-events.html`),'events');
  ok(existsSync(`${ROOT}/portal-organization.html`),'My Organization');
  const org=readFileSync(`${ROOT}/portal-organization.html`,'utf8');
  ok(/My Organization/.test(org),'live org page title');
  const nav=readFileSync(`${ROOT}/portal.html`,'utf8');
  ok(/href="portal-organization.html"/.test(nav),'nav under YOU');
  const js=readFileSync(`${ROOT}/assets/js/paaipe-entry-popup.js`,'utf8');
  ok(js.includes('portal-organization.html'),'partner tile uses the live page');
  ok(js.includes('portal-sessions.html#tab=sessions'),'sessions tab');
  ok(js.includes('portal-sessions.html#tab=micros'),'micros tab');
  ok(js.includes('portal-events.html'),'events route');
});

await T('signed copy is exact',()=>{
  const js=readFileSync(`${ROOT}/assets/js/paaipe-entry-popup.js`,'utf8');
  ok(js.includes(`title: "${TITLE}"`),'headline');
  ok(js.includes(`lead: "${LEAD}"`),'lead');
  ok(js.includes(`footer: "${FOOT}"`),'footer');
  ok(js.includes('pill: "AI PORTAL"'),'gold pill');
  ok(js.includes('skip: "Skip for now"'),'skip');
  ok(js.includes('Watch Sessions'),'tile 1');
  ok(js.includes('Full recordings from AI Exchange and the association library.'),'tile 1 desc');
  ok(js.includes('MicroLearning'),'tile 2');
  ok(js.includes('Short vertical lessons you can finish between meetings.'),'tile 2 desc');
  ok(js.includes('Join Events'),'tile 3');
  ok(js.includes('See the next AI Exchange and reserve your seat.'),'tile 3 desc');
  ok(js.includes('Become a Partner'),'tile 4');
  ok(js.includes('Put your organization in front of the association.'),'tile 4 desc');
  const css=readFileSync(`${ROOT}/assets/css/paaipe-entry-popup.css`,'utf8');
  ok(css.includes('#002166'),'navy token');
  ok(css.includes('#F2A71B'),'gold token');
  ok(css.includes('#15BBEA'),'cyan token');
  ok(css.includes('Inter'),'Inter');
  ok(/border-radius:22px/.test(css)&&/border-radius:16px/.test(css),'16–22px radii');
  ok(css.includes('linear-gradient(160deg,#0B2A6B'),'navy icon fill from the mock');
  ok(/width:min\(760px,\s*calc\(100vw - 32px\)\)/.test(css),'R-17 fluid width');
  ok(/@media \(max-width:560px\)[\s\S]*\.pe-choices\{grid-template-columns:1fr\}/.test(css),'R-17 phone stack');
  ok(/\.pe-x\{[^}]*width:44px;height:44px;min-width:44px;min-height:44px/.test(css),'R-17 close ≥44');
});

await T('Learnings hub reads #tab=sessions and #tab=micros',()=>{
  const view=readFileSync(`${ROOT}/assets/js/paaipe-session-view.js`,'utf8');
  ok(view.includes('hubTabFromLocation'),'reads location');
  ok(view.includes('name === "micros"'),'micros is a real tab name');
  ok(view.includes('writeHash') || view.includes('#tab='),'writes the tab into the hash');
  const h=readFileSync(`${ROOT}/portal-sessions.html`,'utf8');
  ok(h.includes('data-ss-hub-tab="sessions"')&&h.includes('data-ss-hub-tab="micros"'),'existing tabs');
});

await T('a signed-in Agent sees the popup on Home with the signed copy',async()=>{
  const {p,ctx}=await open({fb:{signedIn:true,status:'agent'}});
  await p.waitForSelector('[data-entry-popup="on"]',{timeout:9000});
  eq(await p.locator('#pe-title').innerText(),TITLE,'headline');
  eq(await p.locator('#pe-lead').innerText(),LEAD,'lead');
  eq(await p.locator('.pe-foot span').first().innerText(),FOOT,'footer');
  eq(await p.locator('.pe-mark-pill').innerText(),'AI PORTAL','pill');
  eq(await p.locator('.pe-skip').innerText(),'Skip for now','skip');
  const tiles=await p.$$eval('[data-pe-path]',els=>els.map(e=>({
    choice:e.getAttribute('data-pe-path'),
    href:e.getAttribute('data-pe-href'),
    title:e.querySelector('h3').textContent,
  })));
  eq(tiles.map(t=>t.choice),['sessions','micros','events','organization'],'four tiles');
  eq(tiles.map(t=>t.title),['Watch Sessions','MicroLearning','Join Events','Become a Partner'],'titles');
  eq(tiles[0].href,'portal-sessions.html#tab=sessions','sessions href');
  eq(tiles[1].href,'portal-sessions.html#tab=micros','micros href');
  eq(tiles[2].href,'portal-events.html','events href');
  eq(tiles[3].href,'portal-organization.html','org href');
  const logo=await p.getAttribute('.pe-mark img','src');
  ok(/paaipe-logo\.png$/.test(logo||''),'existing logo');
  const cols=await p.locator('.pe-choices').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
  eq(cols,2,'2×2 grid');
  const modalW=await p.locator('.pe-modal').evaluate(el=>el.getBoundingClientRect().width);
  ok(Math.abs(modalW-760)<2,`desktop modal stays 760, got ${modalW}`);
  await ctx.close();
});

function measureOpenModal(){
  const html=document.documentElement;
  const modal=document.querySelector('.pe-modal');
  const choices=document.querySelector('.pe-choices');
  const close=document.querySelector('.pe-x');
  const opt=document.querySelector('.pe-opt');
  const pill=document.querySelector('.pe-mark-pill');
  const mr=modal.getBoundingClientRect();
  const cr=close.getBoundingClientRect();
  return {
    overflow:html.scrollWidth-html.clientWidth,
    modalW:mr.width,
    inset:Math.min(mr.left, html.clientWidth-mr.right),
    cols:getComputedStyle(choices).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
    closeW:cr.width,
    closeH:cr.height,
    optH:opt.getBoundingClientRect().height,
    pillPx:parseFloat(getComputedStyle(pill).fontSize),
  };
}

await T('R-17 @320/@390: overflow ≤0, choices stack, close ≥44',async()=>{
  for(const vp of [{width:320,height:568},{width:390,height:844}]){
    const {p,ctx}=await open({fb:{signedIn:true,uid:`u-r17-${vp.width}`},viewport:vp});
    await p.waitForSelector('[data-entry-popup="on"]',{timeout:9000});
    const m=await p.evaluate(measureOpenModal);
    ok(m.overflow<=0,`${vp.width}: overflow ${m.overflow}`);
    ok(m.modalW<=vp.width-32+0.75,`${vp.width}: modal ${m.modalW} exceeds 16px inset`);
    ok(m.inset>=15.25,`${vp.width}: inset ${m.inset}`);
    eq(m.cols,1,`${vp.width} columns`);
    ok(m.closeW>=44&&m.closeH>=44,`${vp.width}: close ${m.closeW}×${m.closeH}`);
    ok(m.optH>=44,`${vp.width}: option ${m.optH}`);
    ok(m.pillPx>=12,`${vp.width}: pill ${m.pillPx}`);
    await ctx.close();
  }
});

await T('R-17 @768: signed 2-col desktop look, no overflow',async()=>{
  const {p,ctx}=await open({fb:{signedIn:true,uid:'u-r17-768'},viewport:{width:768,height:900}});
  await p.waitForSelector('[data-entry-popup="on"]',{timeout:9000});
  const m=await p.evaluate(measureOpenModal);
  ok(m.overflow<=0,`768: overflow ${m.overflow}`);
  eq(m.cols,2,'768 keeps 2 columns');
  ok(m.modalW>=700&&m.modalW<=760,`768 modal desktop-sized, got ${m.modalW}`);
  ok(m.closeW>=44&&m.closeH>=44,`768 close ${m.closeW}×${m.closeH}`);
  await ctx.close();
});

await T('a signed-in Guest (pending confirmation) also sees it — not a role subset',async()=>{
  const {p,ctx}=await open({fb:{signedIn:true,status:'guest'}});
  await p.waitForSelector('[data-entry-popup="on"]',{timeout:9000});
  ok(await p.locator('#pe-title').isVisible(),'shown to signed-in guest');
  await ctx.close();
});

await T('a visitor who is not signed in never gets the popup',async()=>{
  const {p,ctx}=await open({fb:{signedIn:false}});
  await p.waitForURL(/signin\.html/,{timeout:9000});
  eq(await p.locator('[data-entry-popup]').count(),0,'no popup on the bounce');
  await ctx.close();
});

await T('Events is not Home, so the popup does not appear there',async()=>{
  const {p,ctx}=await open({page:'portal-events.html',fb:{signedIn:true}});
  await p.waitForSelector('.side .menu',{timeout:9000});
  await p.waitForTimeout(400);
  eq(await p.locator('[data-entry-popup]').count(),0,'absent off Home');
  await ctx.close();
});

await T('Skip for now persists and stays on Home',async()=>{
  const {p,ctx}=await open({fb:{signedIn:true,uid:'u1'}});
  await p.waitForSelector('[data-entry-popup="on"]',{timeout:9000});
  await p.click('.pe-skip');
  await p.waitForSelector('[data-entry-popup="on"]',{state:'detached',timeout:5000});
  ok(/portal\.html(?:$|\?)/.test(p.url())||/\/portal(?:\.html)?$/.test(new URL(p.url()).pathname),'stayed on Home');
  const stored=await p.evaluate(()=>localStorage.getItem('paaipe.entry-popup.v1:u1'));
  ok(stored&&JSON.parse(stored).choice==='skip',`stored skip: ${stored}`);
  await p.reload({waitUntil:'load'});
  await p.waitForSelector('.side .menu',{timeout:9000});
  await p.waitForTimeout(400);
  eq(await p.locator('[data-entry-popup]').count(),0,'does not return');
  await ctx.close();
});

await T('close × is the same persist as Skip and stays on Home',async()=>{
  const {p,ctx}=await open({fb:{signedIn:true,uid:'u-close'}});
  await p.waitForSelector('[data-entry-popup="on"]',{timeout:9000});
  await p.click('.pe-x');
  await p.waitForSelector('[data-entry-popup="on"]',{state:'detached',timeout:5000});
  ok(/portal/.test(p.url()),'stayed on Home');
  const stored=await p.evaluate(()=>localStorage.getItem('paaipe.entry-popup.v1:u-close'));
  ok(stored&&JSON.parse(stored).choice==='skip',`stored skip: ${stored}`);
  await ctx.close();
});

await T('persist is per signed-in user',async()=>{
  const {p,ctx}=await open({fb:{signedIn:true,uid:'u2'},stored:{u1:'skip'}});
  await p.waitForSelector('[data-entry-popup="on"]',{timeout:9000});
  ok(await p.locator('#pe-title').isVisible(),'u2 still sees it after u1 skipped');
  await ctx.close();
});

await T('Watch Sessions goes to the existing Sessions tab',async()=>{
  const {p,ctx}=await open({fb:{signedIn:true,uid:'u-sess'}});
  await p.waitForSelector('[data-entry-popup="on"]',{timeout:9000});
  await p.click('[data-pe-path="sessions"]');
  await p.waitForURL(/portal-sessions\.html/,{timeout:9000});
  ok(/tab=sessions/.test(p.url()),`url carries the tab: ${p.url()}`);
  await p.waitForSelector('[data-ss-hub-tab="sessions"][aria-selected="true"]',{timeout:9000});
  ok(await p.locator('[data-ss-hub-panel="sessions"]').isVisible(),'sessions panel');
  ok(!(await p.locator('[data-ss-hub-panel="micros"]').isVisible()),'micros hidden');
  const stored=await p.evaluate(()=>localStorage.getItem('paaipe.entry-popup.v1:u-sess'));
  ok(stored&&JSON.parse(stored).choice==='sessions','persisted sessions');
  await ctx.close();
});

await T('MicroLearning goes to the existing Micros tab on the same page',async()=>{
  const {p,ctx}=await open({fb:{signedIn:true,uid:'u-micro'}});
  await p.waitForSelector('[data-entry-popup="on"]',{timeout:9000});
  await p.click('[data-pe-path="micros"]');
  await p.waitForURL(/portal-sessions\.html/,{timeout:9000});
  ok(/tab=micros/.test(p.url()),`url carries micros: ${p.url()}`);
  await p.waitForSelector('[data-ss-hub-tab="micros"][aria-selected="true"]',{timeout:9000});
  ok(await p.locator('[data-ss-hub-panel="micros"]').isVisible(),'micros panel');
  ok(!(await p.locator('[data-ss-hub-panel="sessions"]').isVisible()),'sessions hidden');
  await ctx.close();
});

await T('Join Events goes to portal-events.html',async()=>{
  const {p,ctx}=await open({fb:{signedIn:true,uid:'u-ev'}});
  await p.waitForSelector('[data-entry-popup="on"]',{timeout:9000});
  await p.click('[data-pe-path="events"]');
  await p.waitForURL(/portal-events\.html/,{timeout:9000});
  const stored=await p.evaluate(()=>localStorage.getItem('paaipe.entry-popup.v1:u-ev'));
  ok(stored&&JSON.parse(stored).choice==='events','persisted events');
  await ctx.close();
});

await T('Become a Partner goes to the live My Organization page',async()=>{
  const {p,ctx}=await open({fb:{signedIn:true,uid:'u-org'}});
  await p.waitForSelector('[data-entry-popup="on"]',{timeout:9000});
  await p.click('[data-pe-path="organization"]');
  await p.waitForURL(/portal-organization\.html/,{timeout:9000});
  await p.waitForSelector('.side .menu',{timeout:9000});
  ok(await p.locator('.side .menu a[href="portal-organization.html"]').count(),'nav item exists');
  await ctx.close();
});

await T('a deep link to Learnings Micros opens that tab without the popup',async()=>{
  const {p,ctx}=await open({page:'portal-sessions.html#tab=micros',fb:{signedIn:true}});
  await p.waitForSelector('[data-ss-hub-tab="micros"][aria-selected="true"]',{timeout:9000});
  ok(await p.locator('[data-ss-hub-panel="micros"]').isVisible(),'micros from hash');
  eq(await p.locator('[data-entry-popup]').count(),0,'popup is Home-only');
  await ctx.close();
});

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();
process.exit(fail?1:0);
