/* The September recap link: members-first, and honest about where it goes. */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const BASE=process.env.PAAIPE_BASE||'http://127.0.0.1:8899', ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
const REAL_FB=readFileSync(`${ROOT}/assets/js/paaipe-firebase.js`,'utf8');
const REAL_DATA=readFileSync(`${ROOT}/assets/js/paaipe-events-data.js`,'utf8');
let pass=0,fail=0;
const T=async(n,f)=>{try{await f();console.log(`  PASS  ${n}`);pass++}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++}};
const ok=(c,m)=>{if(!c)throw new Error(m)};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)};

const EVENTS=[{id:'2026-09-ai-exchange',slug:'event-2026-09-ai-exchange',
  title:'AI Exchange — September 2026',status:'held',date:'2026-09-15',timezone:'Asia/Manila'}];
const fbStub=({signedIn=false,fails=false}={})=>`
  export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){
    ${fails?"throw new Error('offline');":''}
    return ${signedIn}?{uid:'u1',email:'a@b.c',full_name:'A B',status:'agent'}:null}
  export async function isAdminNow(){return false}
  export async function signOutNow(){}`;
const dataStub=`
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function listEvents(){ return ${JSON.stringify(EVENTS)} }
  export async function getEventBySlug(){ return ${JSON.stringify(EVENTS[0])} }
  export async function listOrganizations(){ return [] }
  export async function listEventSponsors(){ return [] }
  export async function myApplications(){ return new Map() }`;

const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:1280,height:1000}});
const errs=[];
async function open(opts={}){
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub(opts)}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub}));
  await p.goto(`${BASE}/event-2026-09-ai-exchange.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-members-links]',{timeout:9000});
  return p;
}
const recap=p=>p.locator('[data-members-only]');

await T('a signed-OUT visitor is sent to sign up, and the button says so',async()=>{
  const p=await open({signedIn:false});
  eq(await p.getAttribute('html','data-members-links'),'prompt','state');
  eq(await recap(p).getAttribute('href'),'signup.html?next=resources.html',
     'the destination, with where to come back to');
  eq((await recap(p).innerText()).trim(),'Sign up to see the recap',
     'a button that still said "Recap resources" while landing on a sign-up form is a bait-and-switch');
  await p.close();
});

/* NETLIFY REWRITES EVERY INTERNAL HREF AS IT SERVES THE PAGE:
 * href="resources.html" goes out as href='/resources'. The local server does
 * not, so the committed HTML and the served HTML are different documents — and
 * this code reads an href at RUNTIME, so it reads the served one. The live site
 * built ?next=%2Fresources, the guard refused it, and the visitor landed in the
 * Portal. These two serve the rewritten form on purpose. */
await T('a Netlify-rewritten href still produces a usable next=',async()=>{
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub({})}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub}));
  await p.route('**/event-2026-09-ai-exchange.html',async r=>{
    const src=readFileSync(`${ROOT}/event-2026-09-ai-exchange.html`,'utf8');
    r.fulfill({contentType:'text/html',body:src.replace('href="resources.html"',"href='/resources'")});
  });
  await p.goto(`${BASE}/event-2026-09-ai-exchange.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-members-links]',{timeout:9000});
  eq(await recap(p).getAttribute('href'),'signup.html?next=resources.html',
     'the pretty URL must be reduced to the shape the guard accepts');
  await p.close();
});

await T('samePage reduces every shape the site can hand it, and refuses the rest',async()=>{
  const p=await open({signedIn:true});
  const r=await p.evaluate(async()=>{
    const { samePage }=await import('/assets/js/paaipe-samepage.js');
    return ['resources.html','/resources','/resources/','resources','/portal-sessions',
            'a.html?x=1#y','sub/dir/page.html','//evil.example','https://evil.example/x',
            'javascript:alert(1)','../../etc/passwd','','/','.','-x.html']
      .map(v=>[v,samePage(v)]);
  });
  const m=Object.fromEntries(r);
  eq(m['/resources'],'resources.html','the Netlify form');
  eq(m['/resources/'],'resources.html','with a trailing slash');
  eq(m['resources'],'resources.html','bare');
  eq(m['/portal-sessions'],'portal-sessions.html','hyphens survive');
  eq(m['a.html?x=1#y'],'a.html','query and hash dropped');
  for(const bad of ['//evil.example','https://evil.example/x','javascript:alert(1)',
                    '../../etc/passwd','','/','.','-x.html'])
    eq(m[bad],'',`MUST refuse ${JSON.stringify(bad)}`);
  await p.close();
});

await T('a signed-IN member goes straight to the resources',async()=>{
  const p=await open({signedIn:true});
  eq(await p.getAttribute('html','data-members-links'),'member','state');
  eq(await recap(p).getAttribute('href'),'resources.html','no detour for a member');
  eq((await recap(p).innerText()).trim(),'Recap resources','and the plain label');
  await p.close();
});

await T('when we cannot tell, the plain public link is left alone',async()=>{
  const p=await open({fails:true});
  eq(await p.getAttribute('html','data-members-links'),'unknown','state');
  eq(await recap(p).getAttribute('href'),'resources.html',
     'a network failure must not turn a working link into a sign-up prompt');
  await p.close();
});

await T('BREAK-CHECK: the label follows the SIGN-IN STATE, not the markup',async()=>{
  const out=await open({signedIn:false});
  const a=(await recap(out).innerText()).trim(); await out.close();
  const inn=await open({signedIn:true});
  const b=(await recap(inn).innerText()).trim(); await inn.close();
  ok(a!==b,`the same HTML must produce two different buttons, got "${a}" both times`);
});

await T('the link still works with no JavaScript at all',()=>{
  const html=readFileSync(`${ROOT}/event-2026-09-ai-exchange.html`,'utf8');
  const m=/<a[^>]*data-members-only[^>]*>/.exec(html);
  ok(m,'the anchor is in the markup');
  ok(/href="resources\.html"/.test(m[0]),
     'it keeps a real href, so it is a working link before any script runs');
});

/* ?next= is an open redirect if it is not validated: a paaipe.org link that
 * bounces to an attacker's site is a PAAIPE-branded phishing page. */
const GUARD=/^[a-z0-9][a-z0-9-]*\.html(?:[?#][^\s]*)?$/i;

await T('the next= guard accepts a same-site page and nothing else',()=>{
  for(const good of ['resources.html','portal-sessions.html','a.html?x=1#y','A.HTML'])
    ok(GUARD.test(good),`should accept ${good}`);
  for(const bad of ['//evil.example','https://evil.example','http://x','\\\\evil.example',
                    '/\\evil.example','../../etc/passwd','sub/dir.html','/resources.html',
                    'javascript:alert(1)','resources.htmlx','','.html','-x.html'])
    ok(!GUARD.test(bad),`MUST refuse ${JSON.stringify(bad)}`);
});

await T('signup and signin both use the guard on every landing',()=>{
  for(const f of ['signup.html','signin.html']){
    const s=readFileSync(`${ROOT}/${f}`,'utf8');
    ok(/function nextPage/.test(s),`${f} defines the guard`);
    eq((s.match(/location\.href\s*=\s*['"]portal\.html['"]/g)||[]).length,0,
       `${f} must not have an unguarded landing left`);
    ok(/nextPage\('portal\.html'\)/.test(s),`${f} routes through it`);
  }
});

await T('the guard regex in BOTH pages is the one that was tested',()=>{
  for(const f of ['signup.html','signin.html']){
    const s=readFileSync(`${ROOT}/${f}`,'utf8');
    const m=/return \/(.+?)\/i\.test\(raw\)/.exec(s);
    ok(m,`found the regex in ${f}`);
    eq(m[1],GUARD.source,`${f} and this test must not drift apart`);
  }
});

await T('the signup congrats button honours next=',()=>{
  const s=readFileSync(`${ROOT}/signup.html`,'utf8');
  ok(/data-congrats-go/.test(s),'the button is addressable');
  ok(/go\.setAttribute\('href',dest\)/.test(s),
     'the email path ends on an overlay, not a redirect, so it needs its own handling');
});

await T('no console errors',()=>ok(errs.length===0,errs.join(' | ')));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
