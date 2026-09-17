/* Resources is members-only: guests and Agents in, nobody else.
 * Owner's ruling 2026-09-17: "anyone in the portal guests and agents can access it." */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const BASE=process.env.PAAIPE_BASE||'http://127.0.0.1:8899', ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
const REAL_FB=readFileSync(`${ROOT}/assets/js/paaipe-firebase.js`,'utf8');
let pass=0,fail=0;
const T=async(n,f)=>{try{await f();console.log(`  PASS  ${n}`);pass++}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++}};
const ok=(c,m)=>{if(!c)throw new Error(m)};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)};

/* status is what paaipe_agents stores; the REAL membershipStatus derives the
 * rest, so this tests the rule and not a copy of it. */
const fbStub=({signedIn=true,status='guest',emailVerified=true,configured=true,throws=false}={})=>`
  export * from '/assets/js/paaipe-firebase-real.js';
  export function isConfigured(){return ${configured}}
  export async function currentAgent(){
    ${throws?"throw new Error('offline');":''}
    return ${signedIn}?{uid:'u1',email:'a@b.c',full_name:'A B',status:'${status}',emailVerified:${emailVerified}}:null}`;

const br=await chromium.launch();
const errs=[];
async function open(opts={},{js=true}={}){
  const ctx=await br.newContext({viewport:{width:1280,height:900},javaScriptEnabled:js});
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  if(js){
    await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
    await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub(opts)}));
  }
  await p.goto(`${BASE}/resources.html`,{waitUntil:'load'});
  return p;
}
const lib=p=>p.locator('h2:has-text("The library")').first();

await T("a GUEST awaiting confirmation gets in — the owner's ruling",async()=>{
  const p=await open({status:'guest'});
  await p.waitForSelector('html[data-gate="ok"]',{timeout:9000});
  eq(await p.getAttribute('html','data-gate-reason'),'guest','recorded as a guest');
  ok(await lib(p).isVisible(),'the library is readable');
  await p.close();
});

await T('an unverified GUEST gets in too — signing in is the test, not confirmation',async()=>{
  const p=await open({status:'guest',emailVerified:false});
  await p.waitForSelector('html[data-gate="ok"]',{timeout:9000});
  ok(await lib(p).isVisible(),'still in');
  await p.close();
});

await T('an AGENT gets in',async()=>{
  const p=await open({status:'agent'});
  await p.waitForSelector('html[data-gate="ok"]',{timeout:9000});
  eq(await p.getAttribute('html','data-gate-reason'),'agent','recorded as an agent');
  await p.close();
});

await T('a signed-OUT visitor is sent to sign in, and can come back',async()=>{
  const p=await open({signedIn:false});
  await p.waitForURL('**/signin.html?next=resources.html',{timeout:9000});
  await p.close();
});

await T('a member arriving at the PRETTY url still gets a way back',async()=>{
  // Netlify serves this page at /resources, not /resources.html. The obvious
  // pathname.split("/").pop() yields "resources", the guard refuses it, and the
  // member is sent to sign in with no way back to what they were reading.
  const ctx=await br.newContext({viewport:{width:1280,height:900}});
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub({signedIn:false})}));
  await p.route('**/resources',async r=>r.fulfill({contentType:'text/html',
    body:readFileSync(`${ROOT}/resources.html`,'utf8')}));
  await p.goto(`${BASE}/resources`,{waitUntil:'domcontentloaded'});
  await p.waitForURL('**/signin.html?next=resources.html',{timeout:9000});
  await p.close();
});

await T('a SUSPENDED member is told, not bounced to a sign-in that cannot help',async()=>{
  const p=await open({status:'suspended'});
  await p.waitForSelector('[data-gate-panel]',{timeout:9000});
  eq(await p.getAttribute('html','data-gate-reason'),'suspended','reason');
  ok(/suspended/i.test(await p.locator('[data-gate-panel]').innerText()),'says why');
  ok(!/signin\.html/.test(await p.url()),'must NOT redirect — signing in again does not fix it');
  ok(!(await lib(p).isVisible()),'and the library stays hidden');
  await p.close();
});

await T('the library is NEVER painted before the check resolves',async()=>{
  const ctx=await br.newContext({viewport:{width:1280,height:900}});
  const p=await ctx.newPage();
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',async r=>{
    await new Promise(z=>setTimeout(z,1200));
    r.fulfill({contentType:'text/javascript',body:fbStub({status:'agent'})});
  });
  // 'commit' = the response has started. A module script runs BEFORE
  // DOMContentLoaded, so waiting for that event waits for the very gate this is
  // trying to race — the first version of this test passed for that reason and
  // proved nothing.
  await p.goto(`${BASE}/resources.html`,{waitUntil:'commit'});
  await p.waitForSelector('h2',{state:'attached',timeout:8000});
  eq(await p.getAttribute('html','data-gate'),null,'the check has not finished yet');
  ok(!(await lib(p).isVisible()),'hidden while the check is still running');
  await p.waitForSelector('html[data-gate="ok"]',{timeout:9000});
  ok(await lib(p).isVisible(),'and revealed once it passes');
  await p.close();
});

await T('BREAK-CHECK: the reveal is what makes it visible, not the stylesheet',async()=>{
  const p=await open({status:'agent'});
  await p.waitForSelector('html[data-gate="ok"]',{timeout:9000});
  ok(await lib(p).isVisible(),'visible when gated ok');
  await p.evaluate(()=>document.documentElement.setAttribute('data-gate','checking'));
  ok(!(await lib(p).isVisible()),
     'taking the attribute away must hide it again, or the rule is not doing the work');
  await p.close();
});

await T('a network failure explains itself and does NOT reveal the library',async()=>{
  const p=await open({throws:true});
  await p.waitForSelector('[data-gate-panel]',{timeout:9000});
  eq(await p.getAttribute('html','data-gate-reason'),'offline','reason');
  ok(!(await lib(p).isVisible()),'failing open would be the same as having no gate');
  ok(/couldn.t reach|connection/i.test(await p.locator('[data-gate-panel]').innerText()),'says what happened');
  ok(await p.locator('[data-gate-retry]').isVisible(),'and offers a retry');
  await p.close();
});

await T('auth not configured explains itself instead of looping to sign-in',async()=>{
  const p=await open({configured:false});
  await p.waitForSelector('[data-gate-panel]',{timeout:9000});
  ok(!/signin\.html/.test(await p.url()),'nobody can sign in, so bouncing there is a loop');
  ok(!(await lib(p).isVisible()),'still closed');
  ok(/isn.t connected|can.t check/i.test(await p.locator('[data-gate-panel]').innerText()),'says so');
  await p.close();
});

await T('with JavaScript OFF it fails closed and says why',async()=>{
  const p=await open({},{js:false});
  ok(!(await lib(p).isVisible()),
     'revealing the page to anyone who turns JavaScript off is the same as no gate');
  // The explanation must be VISIBLE, not merely present: the hide rule is a
  // body>* rule and eats the <noscript> too unless it is excluded, leaving a
  // blank page and no way to find out why.
  ok(await p.locator('noscript h1').first().isVisible(),
     'the JavaScript-off explanation must actually be on screen');
  ok(/needs JavaScript/i.test(await p.locator('noscript h1').first().textContent()),'and say what to do');
  await p.close();
});

/* ------------------------------------------------------ what it does NOT do */

await T('the page does not claim the materials are secret',()=>{
  const s=readFileSync(`${ROOT}/resources.html`,'utf8');
  ok(!/confidential|do not share|members only.*secret/i.test(s),
     'the outbound links are public YouTube and Gamma URLs; nothing may imply otherwise');
});

await T('the module says out loud that this is not a security boundary',()=>{
  const js=readFileSync(`${ROOT}/assets/js/paaipe-members-only.js`,'utf8');
  ok(/static site/i.test(js)&&/curl/i.test(js),
     'the next person must not mistake this for a real gate');
  ok(/public URLs?/i.test(js),'and must know the materials themselves are public');
});

await T('the gate rule is in the PAGE, not in a stylesheet that loads later',()=>{
  const s=readFileSync(`${ROOT}/resources.html`,'utf8');
  const head=s.slice(0,s.indexOf('</head>'));
  ok(/html:not\(\[data-gate="ok"\]\)/.test(head),
     'an external stylesheet can arrive after first paint, which is exactly the flash this prevents');
  ok(/:not\(noscript\)/.test(head),
     'and the <noscript> must be excluded, or it is hidden by the rule it exists to explain');
});

await T('no console errors',()=>ok(errs.length===0,errs.join(' | ')));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
