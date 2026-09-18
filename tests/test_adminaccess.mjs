/* /admin access control — the surface where a silent regression is dangerous.
 *
 * Every admin page must turn away a visitor who is not signed in, and turn away
 * a signed-in member who is not an administrator. The second is the one worth
 * testing hardest: it is the case that looks fine in a browser you are already
 * an admin in.
 *
 * THIS IS THE CONSOLE DOOR, NOT THE SECURITY BOUNDARY. The boundary is
 * firestore.rules: a non-admin who bypassed every line of this would still read
 * and write nothing, because isAdmin() is checked on the server for each
 * document. These assertions are about not showing somebody a console they
 * cannot use - and about not leaving them holding a session on it.
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

/* Every console page, and what it must do when it should not be shown. */
const GUARDED=['admin-events.html','admin-partners.html','admin-registrations.html',
               'admin-organizations.html','admin-speaker-brief.html','admin-contacts.html'];

const fbStub=({signedIn=true,admin=true,signOutCalls=true}={})=>`
  export * from '/assets/js/paaipe-firebase-real.js';
  window.__signOut=0;
  export async function currentAgent(){return ${signedIn}
    ? {uid:'u1',email:'${admin?'admin@upupapp.asia':'member@example.com'}',full_name:'A',status:'guest'} : null}
  export async function isAdminNow(){return ${admin}}
  export async function signOutNow(){ window.__signOut++; ${signOutCalls?'':'throw new Error("boom")'} }
  export async function listMembers(){return []}
  export async function listRegistrations(){return []}
  export async function countNewPartnerApplications(){return 0}`;
const dataStub=`
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function listEvents(){ return [] }
  export async function listOrganizations(){ return [] }
  export async function listEventSponsors(){ return [] }
  export async function listPartnerApplicationsFor(){ return [] }
  export async function listAllRegistrations(){ return [] }`;

const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:1280,height:900}});
const errs=[];
async function go(page,opts={}){
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub(opts)}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub}));
  await p.goto(`${BASE}/${page}`,{waitUntil:'load'});
  return p;
}

/* ------------------------------------------------------ signed out */

await T('a signed-out visitor is sent to the door from EVERY console page',async()=>{
  for(const page of GUARDED){
    const p=await go(page,{signedIn:false});
    await p.waitForURL('**/admin.html*',{timeout:9000})
      .catch(()=>{throw new Error(`${page} did not send a signed-out visitor to the door`)});
    await p.close();
  }
});

await T('/admin itself shows the sign-in door, not a console',async()=>{
  const p=await go('admin.html',{signedIn:false});
  await p.waitForSelector('html[data-admin-door="ready"]',{timeout:9000});
  ok(await p.locator('[data-panel="signin"]').isVisible(),'the sign-in panel');
  ok(!(await p.locator('[data-console]').isVisible()),'and no console behind it');
  await p.close();
});

/* --------------------------------- signed in, but NOT an administrator */

await T('a signed-in NON-admin is turned away from every console page',async()=>{
  for(const page of GUARDED){
    const p=await go(page,{admin:false});
    await p.waitForURL('**/admin.html?denied=1',{timeout:9000})
      .catch(()=>{throw new Error(`${page} let a non-admin in, or did not say why`)});
    await p.close();
  }
});

await T('a non-admin is SIGNED OUT, not left holding a session',async()=>{
  // Leaving them signed in means the next page they open tries again, and the
  // browser keeps a token for a console they cannot use.
  const p=await go('admin-events.html',{admin:false});
  await p.waitForURL('**/admin.html?denied=1',{timeout:9000});
  await p.close();
  const js=readFileSync(`${ROOT}/assets/js/paaipe-admin-events.js`,'utf8');
  const guard=js.slice(js.indexOf('if (!ok)'),js.indexOf('if (!ok)')+160);
  ok(/signOutNow/.test(guard),'the guard must sign them out before redirecting');
});

await T('the door SAYS why, rather than silently showing sign-in again',async()=>{
  const p=await go('admin.html?denied=1',{signedIn:false});
  await p.waitForSelector('html[data-admin-door="ready"]',{timeout:9000});
  const t=await p.locator('[data-admin-error]').innerText();
  ok(/not a PAAIPE administrator/i.test(t),`should explain: ${t}`);
  await p.close();
});

await T('BREAK-CHECK: flipping ONLY isAdminNow decides it',async()=>{
  // Same page, same session, same everything but the one answer.
  const yes=await go('admin-events.html',{admin:true});
  await yes.waitForSelector('html[data-admin-events]',{timeout:9000});
  ok(!/denied/.test(yes.url()),'an admin gets in');
  await yes.close();
  const no=await go('admin-events.html',{admin:false});
  await no.waitForURL('**/admin.html?denied=1',{timeout:9000});
  await no.close();
});

/* ------------------------------------------------------ the admin gets in */

await T('an administrator reaches each console page',async()=>{
  const marker={'admin-events.html':'[data-admin-events]','admin-partners.html':'[data-admin-partners]',
                'admin-registrations.html':'[data-admin-registrations]',
                'admin-organizations.html':'[data-admin-orgs]','admin-speaker-brief.html':'[data-admin-brief]',
                'admin-contacts.html':'[data-admin-contacts]'};
  for(const page of GUARDED){
    const p=await go(page);
    await p.waitForSelector(`body${marker[page]}`,{timeout:9000});
    ok(!/denied/.test(p.url()),`${page} turned an administrator away`);
    await p.close();
  }
});

/* ------------------------------------- when the answer cannot be obtained */

await T('a failed admin check shows NO data and says so — and does not bounce',async()=>{
  // Deliberately not a redirect: a network blip must not send a real
  // administrator to a sign-in page they do not need and cannot get past,
  // which reads as "your account stopped working". Nothing is shown instead.
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:`
    export * from '/assets/js/paaipe-firebase-real.js';
    export async function currentAgent(){return {uid:'u1',email:'a@b.c',status:'guest'}}
    export async function isAdminNow(){throw new Error('offline')}
    export async function signOutNow(){}`}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub}));
  await p.goto(`${BASE}/admin-events.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-admin-events="offline"]',{timeout:9000});
  ok(!/denied/.test(p.url()),'a network fault is not a refusal, and must not read as one');
  ok(/could not be reached/i.test(await p.locator('[data-flash]').innerText()),'it says what happened');
  const rows=await p.locator('[data-events]').innerText();
  ok(!/Loading/.test(rows),`the table must not sit on "Loading…" for ever: ${rows}`);
  ok(/could not be loaded/i.test(rows),'it says the list failed, not that there are none');
  await p.close();
});

await T('every console page distinguishes "cannot ask" from "not an admin"',()=>{
  // Collapsing the two signs a real administrator out over a network blip and
  // then tells them their account was refused.
  for(const f of ['events','partners','registrations','orgs','brief','contacts']){
    const js=readFileSync(`${ROOT}/assets/js/paaipe-admin-${f}.js`,'utf8');
    ok(!/isAdminNow\(\)\.catch\(\(\) => false\)/.test(js),
       `paaipe-admin-${f}.js collapses a failed check into "not an admin"`);
    ok(/try \{[^}]*isAdminNow\(\)/.test(js.replace(/\n/g,' ')),
       `paaipe-admin-${f}.js must handle the throw separately`);
  }
});

/* --------------------------------------------- what the pages promise */

await T('every admin page keeps search engines out',()=>{
  for(const f of ['admin.html',...GUARDED,'admin-agents.html']){
    const s=readFileSync(`${ROOT}/${f}`,'utf8');
    ok(/name="robots" content="noindex,nofollow"/.test(s),`${f} is missing noindex`);
  }
});

await T('no admin page is reachable from the public navigation',()=>{
  const publicPages=['index.html','events.html','resources.html','partners.html',
                     'member-benefits.html','programs.html','portal.html'];
  for(const f of publicPages){
    const s=readFileSync(`${ROOT}/${f}`,'utf8');
    const hit=/href="(admin[a-z-]*\.html)"/.exec(s);
    ok(!hit,`${f} links to ${hit?.[1]} — /admin is not a public destination`);
  }
});

await T('the rules, not this door, are what actually refuses a non-admin',()=>{
  const rules=readFileSync(`${ROOT}/firestore.rules`,'utf8');
  ok(/function isAdmin\(\)/.test(rules),'isAdmin() exists in the rules');
  ok(/request\.auth\.token\.email/.test(rules),'and it reads the token, not a client claim');
  for(const col of ['paaipe_events','paaipe_event_sponsors'])
    ok(new RegExp(`match /${col}/[^]*?allow create, update: if isAdmin\\(\\)`).test(rules),
       `${col} must be admin-only to write`);
  ok(/function isWellFormedMemberOrgCreate/.test(rules),
     'a signed-in member may create an unpublished organization');
  ok(/d\.status == 'inactive'/.test(rules.slice(rules.indexOf('function isWellFormedMemberOrgCreate'))),
     'and cannot publish it themselves');
});

await T('no console errors',()=>ok(errs.length===0,errs.join(' | ')));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
