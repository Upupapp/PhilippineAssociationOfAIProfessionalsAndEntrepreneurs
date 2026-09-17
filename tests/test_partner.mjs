/* "Partner with us on this event" — public form through to the admin inbox. */
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
  {id:'2026-10-ai-exchange',slug:'event-2026-10-ai-exchange',title:'AI Exchange — October 2026',
   status:'registration_open',date:'2026-10-13',capacity:500,timezone:'Asia/Manila'},
  {id:'2026-11-ai-exchange',slug:'event-2026-11-ai-exchange',title:'AI Exchange — November 2026',
   status:'published',date:'2026-11-10',timezone:'Asia/Manila'},
  {id:'2026-12-ai-exchange',slug:'event-2026-12-ai-exchange',title:'AI Exchange — December 2026',
   status:'published',date:'2026-12-08',timezone:'Asia/Manila'},
  {id:'2026-09-ai-exchange',slug:'event-2026-09-ai-exchange',title:'AI Exchange — September 2026',
   status:'held',date:'2026-09-15',timezone:'Asia/Manila'},
];
const ORGS=[{id:'gethired',name:'GetHired Online',website:'https://gethired.ph',status:'active',logoUrl:'assets/img/partners/logo-gethired.png'},
            {id:'servana',name:'Servana',website:'https://servana.app',status:'active',logoUrl:'assets/img/partners/logo-servana.png'}];

const fbStub=({signedIn=false,uid='u1',email='rosa@example.com',name='Rosa Villanueva',admin=false}={})=>`
  export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return ${signedIn}?{uid:'${uid}',email:'${email}',full_name:'${name}',status:'agent'}:null}
  export async function isAdminNow(){return ${admin}}
  export async function signOutNow(){}
  export async function listMembers(){return []}
  export async function listRegistrations(){return []}
  export async function countNewPartnerApplications(){return 0}`;

/* Every pure helper stays REAL — normalisePhone, acceptsPartners,
 * partnerReference, matchOrganization. Testing a reimplementation of the
 * validator would test the reimplementation. */
const dataStub=({events=EVENTS,orgs=ORGS,mine=[],failWrite=null}={})=>`
  export * from '/assets/js/paaipe-events-data-real.js';
  import { partnerReference } from '/assets/js/paaipe-events-data-real.js';
  window.__writes=[];
  export async function listEvents(){ return ${JSON.stringify(events)} }
  export async function listOrganizations(){ return ${JSON.stringify(orgs)} }
  export async function listEventSponsors(){ return [] }
  export async function myApplications(uid){
    const m=new Map();
    if(uid) for(const a of ${JSON.stringify(mine)}) m.set(a.eventId,a);
    return m;
  }
  export async function submitPartnerApplication(fields){
    window.__writes.push(fields);
    ${failWrite?`throw Object.assign(new Error('nope'),{code:'${failWrite}'});`:''}
    const id='AbCd1234efgh';
    return { id, reference: partnerReference(id) };
  }`;

const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:1280,height:1000}});
const errs=[];
async function open(page='event-2026-10-ai-exchange.html',opts={}){
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.addInitScript(()=>{try{
    Object.keys(localStorage).filter(k=>k.startsWith('paaipe.partner.'))
      .forEach(k=>localStorage.removeItem(k));
  }catch{}});
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub(opts.fb||{})}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub(opts.data||{})}));
  await p.goto(`${BASE}/${page}`,{waitUntil:'load'});
  await p.waitForSelector('html[data-partner-mounts]',{timeout:9000});
  return p;
}
async function fill(p,over={}){
  const v={company:'Northwind Analytics',name:'Rosa Villanueva',email:'rosa@example.com',
           phone:'0917 123 4567',web:'northwind.example.com',msg:'We can put up a speaker.',...over};
  const d=p.locator('[data-partner-dialog]');
  if(v.company!==null) await d.locator('[name="companyName"]').fill(v.company);
  if(v.name!==null)    await d.locator('[name="contactName"]').fill(v.name);
  if(v.email!==null)   await d.locator('[name="email"]').fill(v.email);
  if(v.phone!==null)   await d.locator('[name="phone"]').fill(v.phone);
  if(v.web!==null)     await d.locator('[name="website"]').fill(v.web);
  if(v.msg!==null)     await d.locator('[name="message"]').fill(v.msg);
  if(v.consent!==false) await d.locator('[name="consent"]').check();
}

/* ------------------------------------------------------- where it appears */

await T('the button is offered on the public event page',async()=>{
  const p=await open();
  const n=await p.locator('[data-partner-cta] [data-partner-open]').count();
  ok(n>=1,`expected the button on the event page, found ${n}`);
  ok(/Partner with us on this event/.test(
      await p.locator('[data-partner-cta]').first().innerText()),'the agreed label');
  await p.close();
});

await T('it is offered on the partnership section AND beside Register',async()=>{
  const p=await open();
  eq(await p.locator('[data-partner-cta]').count(),2,'two mounts on an event page');
  eq(await p.locator('[data-partner-open]').count(),2,'both render a button');
  await p.close();
});

await T('every upcoming card on the events list offers it, the past one does not',async()=>{
  const p=await open('events.html');
  eq(await p.locator('[data-partner-open]').count(),3,'three upcoming events');
  eq(await p.locator('.ecell[data-status="past"] [data-partner-open]').count(),0,
     'a held event must not invite sponsorship');
  await p.close();
});

await T('the registration success page offers it as a secondary link',async()=>{
  const p=await open('register-success.html');
  ok(await p.locator('[data-partner-open]').count()>=1,'success page');
  ok(/Want your company on this event/i.test(await p.locator('[data-partner-strip]').innerText()),
     "the brief's wording");
  await p.close();
});

await T('the portal Sessions rows offer it',async()=>{
  const p=await open('portal-sessions.html',{fb:{signedIn:true}});
  ok(await p.locator('[data-partner-open]').count()>=2,'upcoming session rows');
  await p.close();
});

/* ---------------------------------------------- when it must NOT appear */

await T('a HELD event is not offered partnership, and leaves no empty box',async()=>{
  const p=await open('event-2026-09-ai-exchange.html');
  eq(await p.locator('[data-partner-open]').count(),0,'no button on a held event');
  const st=await p.locator('[data-partner-cta]').first().getAttribute('data-partner-cta-state');
  ok(/^hidden:/.test(st),`should say why it is hidden: ${st}`);
  ok(!(await p.locator('[data-partner-strip]').first().isVisible()),
     'the strip and its question must go too, not just the button');
  await p.close();
});

await T('a CANCELLED event is not offered partnership',async()=>{
  const p=await open('event-2026-10-ai-exchange.html',
    {data:{events:EVENTS.map(e=>e.id==='2026-10-ai-exchange'?{...e,status:'cancelled'}:e)}});
  eq(await p.locator('[data-partner-open]').count(),0,'cancelled takes no partners');
  await p.close();
});

await T('BREAK-CHECK: the button follows the RECORD, not the page markup',async()=>{
  const live=await open('event-2026-10-ai-exchange.html');
  eq(await live.locator('[data-partner-open]').count(),2,'open event: shown');
  await live.close();
  const held=await open('event-2026-10-ai-exchange.html',
    {data:{events:EVENTS.map(e=>e.id==='2026-10-ai-exchange'?{...e,status:'held'}:e)}});
  eq(await held.locator('[data-partner-open]').count(),0,'held event: gone');
  await held.close();
});

await T('an event absent from the public list gets no button',async()=>{
  const p=await open('event-2026-10-ai-exchange.html',
    {data:{events:EVENTS.filter(e=>e.id!=='2026-10-ai-exchange')}});
  eq(await p.locator('[data-partner-open]').count(),0,'unreadable means no');
  await p.close();
});

/* ---------------------------------------------------------- the dialog */

await T('the dialog names the event and does not promise an email',async()=>{
  const p=await open();
  await p.locator('[data-partner-open]').first().click();
  const t=await p.locator('[data-partner-dialog]').innerText();
  ok(/Partner with PAAIPE on/.test(t),'heading');
  ok(/October 2026/.test(t),'names the event');
  ok(/reviews every application/i.test(t),'the review promise');
  ok(!/check your (e-?mail|inbox)/i.test(t),'must not promise mail that cannot be sent');
  await p.close();
});

await T('the dialog says why it does not take a logo file',async()=>{
  const p=await open();
  await p.locator('[data-partner-open]').first().click();
  const t=await p.locator('[data-partner-dialog]').innerText();
  ok(/logo/i.test(t),'it addresses the logo at all');
  ok(/no file storage|there is no file storage/i.test(t),'and says why there is no upload');
  eq(await p.locator('[data-partner-dialog] input[type="file"]').count(),0,
     'a file input that discarded the file would be worse than none');
  await p.close();
});

await T('a signed-in Agent finds their name and email already in it',async()=>{
  const p=await open('event-2026-10-ai-exchange.html',{fb:{signedIn:true}});
  await p.locator('[data-partner-open]').first().click();
  const d=p.locator('[data-partner-dialog]');
  eq(await d.locator('[name="contactName"]').inputValue(),'Rosa Villanueva','name');
  eq(await d.locator('[name="email"]').inputValue(),'rosa@example.com','email');
  await p.close();
});

await T("an anonymous visitor gets an empty form, not somebody else's details",async()=>{
  const p=await open();
  await p.locator('[data-partner-open]').first().click();
  const d=p.locator('[data-partner-dialog]');
  eq(await d.locator('[name="contactName"]').inputValue(),'','name');
  eq(await d.locator('[name="email"]').inputValue(),'','email');
  await p.close();
});

/* ------------------------------------------------------------ validation */

await T('a missing company name is refused before anything is written',async()=>{
  const p=await open();
  await p.locator('[data-partner-open]').first().click();
  await fill(p,{company:''});
  await p.locator('[data-submit]').click();
  eq(await p.locator('[data-partner-dialog] .f.bad [name="companyName"]').count(),1,'flagged');
  eq(await p.evaluate(()=>window.__writes.length),0,'nothing may be written');
  await p.close();
});

await T('email validation',async()=>{
  const p=await open();
  await p.locator('[data-partner-open]').first().click();
  for(const bad of ['rosa','rosa@','@example.com','rosa@example','rosa example.com']){
    await fill(p,{email:bad});
    await p.locator('[data-submit]').click();
    eq(await p.locator('.f.bad [name="email"]').count(),1,`should refuse ${bad}`);
  }
  await fill(p,{email:'rosa@example.com'});
  await p.locator('[data-submit]').click();
  await p.waitForFunction(()=>window.__writes.length===1,{timeout:5000});
  await p.close();
});

await T('phone validation accepts every way a Filipino writes their number',async()=>{
  const p=await open();
  for(const good of ['09171234567','+639171234567','0917 123 4567','0917-123-4567','639171234567']){
    await p.evaluate(()=>{window.__writes=[];try{localStorage.clear()}catch{}});
    await p.reload({waitUntil:'load'});
    await p.waitForSelector('html[data-partner-mounts]');
    await p.locator('[data-partner-open]').first().click();
    await fill(p,{phone:good});
    await p.locator('[data-submit]').click();
    await p.waitForFunction(()=>window.__writes.length===1,{timeout:5000});
    eq((await p.evaluate(()=>window.__writes[0])).phone,'+639171234567',`${good} must normalise`);
  }
  await p.close();
});

await T('phone validation refuses a landline, a foreign number and a short one',async()=>{
  const p=await open();
  await p.locator('[data-partner-open]').first().click();
  for(const bad of ['02 8123 4567','+1 415 555 1234','0917123456','not a number']){
    await fill(p,{phone:bad});
    await p.locator('[data-submit]').click();
    eq(await p.locator('.f.bad [name="phone"]').count(),1,`should refuse ${bad}`);
  }
  eq(await p.evaluate(()=>window.__writes.length),0,'nothing written');
  await p.close();
});

await T('consent is required, and it is a real tick not a default',async()=>{
  const p=await open();
  await p.locator('[data-partner-open]').first().click();
  await fill(p,{consent:false});
  eq(await p.locator('[name="consent"]').isChecked(),false,'must not be pre-ticked');
  await p.locator('[data-submit]').click();
  eq(await p.locator('.f.bad [name="consent"]').count(),1,'flagged');
  eq(await p.evaluate(()=>window.__writes.length),0,'nothing written');
  await p.close();
});

/* ------------------------------------------------------------- submitting */

await T('submitting writes the application, with the source it came from',async()=>{
  const p=await open();
  await p.locator('[data-partner-open]').first().click();
  await fill(p);
  await p.locator('[data-partner-dialog] [value="speaker"]').check();
  await p.locator('[data-submit]').click();
  await p.waitForFunction(()=>window.__writes.length===1,{timeout:5000});
  const w=await p.evaluate(()=>window.__writes[0]);
  eq(w.eventId,'2026-10-ai-exchange','the event');
  eq(w.companyName,'Northwind Analytics','company');
  eq(w.phone,'+639171234567','normalised phone');
  eq(w.source,'public_event','where it came from');
  eq(w.supportTypes,['speaker'],'what they offered');
  eq(w.submittedByUserId,'','anonymous submitter claims nobody');
  await p.close();
});

await T('the source records WHICH surface it came from',async()=>{
  const p=await open('events.html');
  await p.locator('[data-partner-open]').first().click();
  await fill(p);
  await p.locator('[data-submit]').click();
  await p.waitForFunction(()=>window.__writes.length===1,{timeout:5000});
  eq((await p.evaluate(()=>window.__writes[0])).source,'events_list','from the list');
  await p.close();
});

await T('a signed-in Agent is recorded as the submitter, and only as themselves',async()=>{
  const p=await open('event-2026-10-ai-exchange.html',{fb:{signedIn:true,uid:'u1'}});
  await p.locator('[data-partner-open]').first().click();
  await fill(p);
  await p.locator('[data-submit]').click();
  await p.waitForFunction(()=>window.__writes.length===1,{timeout:5000});
  eq((await p.evaluate(()=>window.__writes[0])).submittedByUserId,'u1','their own uid');
  await p.close();
});

await T('success shows a reference and does NOT say an email is coming',async()=>{
  const p=await open();
  await p.locator('[data-partner-open]').first().click();
  await fill(p);
  await p.locator('[data-submit]').click();
  await p.waitForSelector('[data-partner-dialog] .ok',{timeout:5000});
  const t=await p.locator('[data-partner-dialog]').innerText();
  ok(/Application received/i.test(t),'the confirmation');
  ok(/5 working days/.test(t),'the promise the brief makes');
  const ref=await p.locator('[data-partner-dialog] .ref').innerText();
  ok(/PA-20\d\d-[0-9A-Z]{4}/.test(ref),`a well-formed reference: ${ref}`);
  ok(/no automatic mail sender|no confirmation email/i.test(t),
     'it must say plainly that no email is coming');
  ok(!/check your (e-?mail|inbox|spam)/i.test(t),'and must not tell them to go and look');
  await p.close();
});

await T('the reference matches the shape the rules will accept',async()=>{
  const p=await open();
  const r=await p.evaluate(async()=>{
    const m=await import('/assets/js/paaipe-events-data.js');
    return [m.partnerReference('AbCd1234efgh',2026), m.partnerReference('x',2026),
            m.referenceSuffix('---'), m.referenceMatchesId({id:'AbCd1234efgh',reference:'PA-2026-ABCD'})];
  });
  ok(/^PA-20\d\d-[0-9A-Z]{4}$/.test(r[0]),`rules regex: ${r[0]}`);
  ok(/^PA-20\d\d-[0-9A-Z]{4}$/.test(r[1]),`a one-character id must still pad: ${r[1]}`);
  eq(r[2],'XXXX','an id with nothing usable still yields four characters');
  eq(r[3],true,'a reference derived from the id verifies against it');
  await p.close();
});

await T('a refused write shows the failure and never a reference',async()=>{
  const p=await open('event-2026-10-ai-exchange.html',{data:{failWrite:'permission-denied'}});
  await p.locator('[data-partner-open]').first().click();
  await fill(p);
  await p.locator('[data-submit]').click();
  await p.waitForFunction(()=>
    (document.querySelector('[data-submit-error]')?.textContent||'').length>0,{timeout:5000});
  eq(await p.locator('[data-partner-dialog] .ref').count(),0,
     'a reference to a document that was never written is the worst thing this could show');
  ok(await p.locator('[data-submit]').isEnabled(),'and they must be able to try again');
  await p.close();
});

await T('the honeypot is not a field a browser would fill',async()=>{
  const p=await open();
  await p.locator('[data-partner-open]').first().click();
  const hp=p.locator('[data-partner-dialog] .hp input');
  eq(await hp.count(),1,'there is one');
  eq(await hp.getAttribute('autocomplete'),'off','autofill must not touch it');
  eq(await hp.getAttribute('tabindex'),'-1','and keyboard users must skip it');
  const name=await hp.getAttribute('name');
  ok(!/name|email|phone|address|company|organization|website|fax|tel/i.test(name),
     `a honeypot named after a real field gets autofilled: ${name}`);
  await p.close();
});

await T('a filled honeypot writes nothing, and does not say why',async()=>{
  const p=await open();
  await p.locator('[data-partner-open]').first().click();
  await fill(p);
  await p.locator('[data-partner-dialog] .hp input').fill('http://spam.example');
  await p.locator('[data-submit]').click();
  await p.waitForSelector('[data-partner-dialog] .ok',{timeout:5000});
  eq(await p.evaluate(()=>window.__writes.length),0,'nothing reaches Firestore');
  await p.close();
});

await T('the same browser cannot send twice for one event in an hour',async()=>{
  const p=await open();
  await p.locator('[data-partner-open]').first().click();
  await fill(p);
  await p.locator('[data-submit]').click();
  await p.waitForSelector('[data-partner-dialog] .ok',{timeout:5000});
  await p.locator('[data-partner-dialog] [data-cancel]').last().click();
  await p.locator('[data-partner-open]').first().click();
  await fill(p);
  await p.locator('[data-submit]').click();
  await p.waitForFunction(()=>
    /already sent an application/i.test(document.querySelector('[data-submit-error]')?.textContent||''),
    {timeout:5000});
  eq(await p.evaluate(()=>window.__writes.length),1,'only the first one was written');
  await p.close();
});

/* ------------------------------------------------------- the portal status */

await T('a member who already applied sees the status, not the button again',async()=>{
  const p=await open('portal-sessions.html',{fb:{signedIn:true,uid:'u1'},
    data:{mine:[{id:'a1',eventId:'2026-11-ai-exchange',reference:'PA-2026-AB12',status:'contacted'}]}});
  const host=p.locator('[data-partner-cta][data-event-id="2026-11-ai-exchange"]');
  const t=await host.innerText();
  ok(/Your partner application/i.test(t),`the status line: ${t}`);
  ok(/PA-2026-AB12/.test(t),'with the reference');
  eq(await host.locator('[data-partner-open]').count(),0,
     'offering to apply again is how one conversation becomes two records');
  eq(await p.locator('[data-partner-cta][data-event-id="2026-12-ai-exchange"] [data-partner-open]').count(),1,
     'a different event is unaffected');
  await p.close();
});

await T('an application marked spam is not described to its author as spam',async()=>{
  const p=await open('portal-sessions.html',{fb:{signedIn:true,uid:'u1'},
    data:{mine:[{id:'a1',eventId:'2026-11-ai-exchange',reference:'PA-2026-AB12',status:'spam'}]}});
  const t=await p.locator('[data-partner-cta][data-event-id="2026-11-ai-exchange"]').innerText();
  ok(!/spam/i.test(t),`telling somebody their offer was marked spam is gratuitous: ${t}`);
  ok(/closed/i.test(t),'it says closed instead');
  await p.close();
});

/* ----------------------------------------------------------- the data rules */

await T('an application NEVER writes to organizations',async()=>{
  const p=await open();
  await p.locator('[data-partner-open]').first().click();
  await fill(p,{company:'GetHired, Inc.'});
  await p.locator('[data-submit]').click();
  await p.waitForFunction(()=>window.__writes.length===1,{timeout:5000});
  const w=await p.evaluate(()=>window.__writes[0]);
  ok(!('organizationId' in w),'an applicant may not name an organization');
  ok(!('status' in w)||w.status===undefined||w.status==='new','and may not arrive pre-accepted');
  await p.close();
});

await T('the organization match is computed, and matches by name AND by domain',async()=>{
  const p=await open();
  const r=await p.evaluate(async()=>{
    const m=await import('/assets/js/paaipe-events-data.js');
    const orgs=await m.listOrganizations();
    return {
      byName:   m.matchOrganization({companyName:'GetHired, Inc.'},orgs)?.id||null,
      strict:   m.matchOrganization({companyName:'GetHired Online Inc.'},orgs)?.id||null,
      spelling: m.matchOrganization({companyName:'  GetHired   Online  '},orgs)?.id||null,
      byDomain: m.matchOrganization({companyName:'Something Else',website:'www.gethired.ph/jobs'},orgs)?.id||null,
      none:     m.matchOrganization({companyName:'Northwind Analytics'},orgs)?.id||null,
      empty:    m.matchOrganization({companyName:'',website:''},orgs)?.id||null,
    };
  });
  eq(r.spelling,'gethired','the same name spelled differently is the same company');
  eq(r.strict,'gethired','and a legal suffix on the real name still matches');
  eq(r.byDomain,'gethired','a different name on the same domain is the same company');
  eq(r.byName,null,
     '"GetHired, Inc." vs "GetHired Online" is NOT guessed from the name alone — the matcher '+
     'would rather miss than link the wrong company, which is why the panel offers a manual link');
  eq(r.none,null,'a company PAAIPE does not know matches nothing');
  eq(r.empty,null,'and an empty application must not match the first row');
  await p.close();
});

await T('a missed match is recoverable - the admin can link the company by hand',()=>{
  const js=readFileSync(`${ROOT}/assets/js/paaipe-admin-partners.js`,'utf8');
  ok(/data-link-org/.test(js),'there is a picker');
  ok(/Create a new organization/.test(js),'including the "it really is new" option');
  const fn=js.slice(js.indexOf('async function acceptApplication'));
  ok(/\[data-link-org\]/.test(fn.slice(0,900)),
     "accept must read the administrator's choice, not re-run the guess");
});

await T('acceptsPartners is decided by status alone',async()=>{
  const p=await open();
  const r=await p.evaluate(async()=>{
    const m=await import('/assets/js/paaipe-events-data.js');
    return Object.fromEntries(['draft','published','registration_open','registration_closed','held','cancelled']
      .map(s=>[s,m.acceptsPartners({status:s})]));
  });
  eq(r.published,true,'published takes partners');
  eq(r.registration_open,true,'so does an open one');
  eq(r.registration_closed,true,'registration closing does not close sponsorship');
  eq(r.held,false,'a held event does not');
  eq(r.cancelled,false,'nor a cancelled one');
  eq(r.draft,false,'nor a draft, which is not public at all');
  await p.close();
});

/* --------------------------------------------------------------- the rules */

const RULES=readFileSync(`${ROOT}/firestore.rules`,'utf8');

await T('the rules let anyone CREATE and nobody but an admin or the author READ',()=>{
  const b=RULES.slice(RULES.indexOf('match /paaipe_partner_applications/'),
                      RULES.indexOf('function isWellFormedPartnerApplication'));
  ok(/allow create:\s*if isWellFormedPartnerApplication/.test(b),'public create');
  ok(/allow read:\s*if isAdmin\(\)/.test(b),'admin read');
  ok(/submittedByUserId[^\n]*==\s*request\.auth\.uid/.test(b),'the author may read their own');
  ok(/allow delete:\s*if false/.test(b),'nobody deletes what somebody submitted');
});

await T('the rules refuse an application that arrives already accepted',()=>{
  const f=RULES.slice(RULES.indexOf('function isWellFormedPartnerApplication'));
  ok(/d\.status == 'new'/.test(f),'status must be new on create');
  ok(/d\.createdAt == request\.time/.test(f),'createdAt cannot be backdated');
  ok(/d\.consentAt == request\.time/.test(f),'nor can the consent timestamp');
});

await T('the admin update rule cannot touch a word the applicant wrote',()=>{
  const b=RULES.slice(RULES.indexOf('match /paaipe_partner_applications/'),
                      RULES.indexOf('function isWellFormedPartnerApplication'));
  const m=/hasOnly\(\[([^\]]*)\]\)/s.exec(b);
  ok(m,'the update must be key-limited');
  const keys=m[1].replace(/\s|'/g,'').split(',').filter(Boolean);
  for(const applicant of ['companyName','contactName','email','phone','website','message',
                          'supportTypes','reference','consentAt','createdAt','eventId'])
    ok(!keys.includes(applicant),`an admin must not be able to rewrite ${applicant}`);
  ok(keys.includes('status'),'but may record a status');
  ok(keys.includes('adminNote'),'and a note');
});

await T('the rules pin the phone to a Philippine mobile',()=>{
  const f=RULES.slice(RULES.indexOf('function isWellFormedPartnerApplication'));
  ok(/\+639\[0-9\]\{9\}/.test(f.replace(/\\\\/g,'\\')),'the +639XXXXXXXXX shape');
});

await T('supportTypes is a closed list in the RULES, not only in the form',()=>{
  const f=RULES.slice(RULES.indexOf('function isWellFormedPartnerApplication'));
  ok(/supportTypes\.hasOnly/.test(f),
     'it is a filter in the console, and a filter over values the client chose means nothing');
});

/* ----------------------------------------------------------- the admin page */

await T('the admin page keeps search engines out',()=>{
  ok(/name="robots" content="noindex,nofollow"/.test(readFileSync(`${ROOT}/admin-partners.html`,'utf8')),'noindex');
});

await T('Partner applications is a built destination in the shared nav',async()=>{
  const p=await open();
  const r=await p.evaluate(async()=>{
    const m=await import('/assets/js/paaipe-admin.js');
    return m.ADMIN_NAV.filter(x=>x.href==='admin-partners.html');
  });
  eq(r.length,1,'one nav entry');
  eq(r[0].built,true,'and it is built, not a "soon" row');
  eq(r[0].badge,'partners','with a badge for what is waiting');
  await p.close();
});

await T('the admin page lists what it cannot do rather than drawing dead buttons',()=>{
  const js=readFileSync(`${ROOT}/assets/js/paaipe-admin-partners.js`,'utf8');
  const gaps=js.slice(js.indexOf('const GAPS = ['),js.indexOf('function renderGaps'));
  ok(/no mail sender|SMTP/i.test(gaps),'the missing sender');
  ok(/no storage bucket/i.test(gaps),'the missing bucket');
  ok(/one administrator/i.test(gaps),'the missing roles');
  ok(/Does not: /.test(js),'and each is SPOKEN, not only struck through');
});

await T('accepting proposes a sponsorship and never confirms one',()=>{
  const js=readFileSync(`${ROOT}/assets/js/paaipe-admin-partners.js`,'utf8');
  const fn=js.slice(js.indexOf('async function acceptApplication'),
                    js.indexOf('/* ------------------------------------------------------------------- export */'));
  ok(/SPONSOR_STATUS\.PROPOSED/.test(fn),'the sponsorship is proposed');
  ok(!/SPONSOR_STATUS\.CONFIRMED/.test(fn),
     'confirming is what puts a logo on the public page, not a side effect of tidying an inbox');
  ok(/status:\s*"inactive"/.test(fn),'a prospect organization is not live on the Partners page');
  ok(/relationshipStatus:\s*"prospect"/.test(fn),'and is recorded as a prospect');
});

await T('a declined or spam application can never reach the public page',()=>{
  const b=RULES.slice(RULES.indexOf('match /paaipe_partner_applications/'),
                      RULES.indexOf('function isWellFormedPartnerApplication'));
  ok(!/allow read:\s*if true/.test(b),'applications are never world-readable');
  const spon=RULES.slice(RULES.indexOf('match /paaipe_event_sponsors/'));
  ok(/in \['confirmed','delivered'\]/.test(spon),'and only confirmed sponsorships are served');
  const view=readFileSync(`${ROOT}/assets/js/paaipe-event-view.js`,'utf8');
  ok(!/partner_application/i.test(view),'the public event view never reads applications');
});

await T('no console errors',()=>ok(errs.length===0,errs.join(' | ')));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
