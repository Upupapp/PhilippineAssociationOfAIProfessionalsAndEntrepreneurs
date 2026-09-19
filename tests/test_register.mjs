/* Registration — the path where a break means nobody can sign up, and where a
 * real person's details are what gets written.
 *
 * The rule this suite exists to protect: SUCCESS IS ONLY SHOWN IF THE WRITE
 * RESOLVED. Everything else here is downstream of that.
 */
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'fs';
const BASE=process.env.PAAIPE_BASE||'http://127.0.0.1:8899', ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
const PAGE='register-2026-10-ai-exchange.html';
const REAL_FB=readFileSync(`${ROOT}/assets/js/paaipe-firebase.js`,'utf8');
const REAL_DATA=readFileSync(`${ROOT}/assets/js/paaipe-events-data.js`,'utf8');
const HTML=readFileSync(`${ROOT}/${PAGE}`,'utf8');
const RULES=readFileSync(`${ROOT}/firestore.rules`,'utf8');
let pass=0,fail=0;
const T=async(n,f)=>{try{await f();console.log(`  PASS  ${n}`);pass++}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++}};
const ok=(c,m)=>{if(!c)throw new Error(m)};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)};

const fbStub=({configured=true,failWith=null,signedIn=false,
  email='rosa@example.com',name='Rosa Villanueva'}={})=>`
  export * from '/assets/js/paaipe-firebase-real.js';
  export function isConfigured(){return ${configured}}
  export async function currentAgent(){return ${signedIn}
    ?{uid:'u1',email:'${email}',full_name:'${name}',displayName:'${name}',status:'agent'}
    :null}
  const _seen=()=>{try{return JSON.parse(sessionStorage.getItem('__writes')||'[]')}catch{return[]}};
  window.__writes=_seen();
  export async function submitRegistration(f){
    const all=_seen(); all.push(f);
    try{sessionStorage.setItem('__writes',JSON.stringify(all))}catch{}
    window.__writes=all;
    ${failWith==='permission-denied'?"throw Object.assign(new Error('nope'),{code:'permission-denied'});":''}
    ${failWith==='network'?"throw new Error('offline');":''}
    return 'doc1';
  }`;
const dataStub=`
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function getEventBySlug(){ return {id:'2026-10-ai-exchange',status:'registration_open',
    title:'AI Exchange — October 2026',questionsEnabled:['position','organization','profile','learn','speaker_question','source']} }
  export async function listEvents(){ return [] }
  export async function listOrganizations(){ return [] }
  export async function listEventSponsors(){ return [] }`;

const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:1280,height:1000}});
const errs=[];
async function open(opts={}){
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub(opts)}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub}));
  const page=opts.page||PAGE;
  const q=opts.query||'';
  await p.goto(`${BASE}/${page}${q}`,{waitUntil:'load'});
  await p.evaluate(()=>{try{sessionStorage.removeItem('__writes')}catch{}});
  await p.waitForSelector('#reg',{timeout:9000});
  await p.waitForFunction(()=>document.documentElement.hasAttribute('data-register-prefill'),{timeout:9000});
  return p;
}
/* Fill every required answer and land on step 3. */
const writes=p=>p.evaluate(()=>{try{return JSON.parse(sessionStorage.getItem('__writes')||'[]')}catch{return[]}});
async function toStep3(p,over={}){
  const v={full_name:'Maria Santos',email:'maria@example.com',learn:'How to start',source:'GetHired',...over};
  await p.fill('[name="full_name"]',v.full_name);
  await p.fill('[name="email"]',v.email);
  await p.check('input[name="profile"][value="founder"]');
  await p.locator('.step[data-step="1"] [data-next]').click();
  await p.fill('[name="learn"]',v.learn);
  await p.locator('.step[data-step="2"] [data-next]').click();
  await p.selectOption('[name="source"]',v.source);
}

/* --------------------------------------------------------------- the wizard */

await T('it opens on step 1 of 3',async()=>{
  const p=await open();
  ok(await p.locator('.step[data-step="1"]').evaluate(e=>e.classList.contains('on')),'step 1 on');
  ok(!(await p.locator('.step[data-step="3"]').evaluate(e=>e.classList.contains('on'))),'step 3 off');
  await p.close();
});

await T('an empty required field blocks the step, and is marked',async()=>{
  const p=await open();
  await p.locator('.step[data-step="1"] [data-next]').click();
  ok(await p.locator('.step[data-step="1"]').evaluate(e=>e.classList.contains('on')),'still on step 1');
  eq(await p.locator('.step[data-step="1"] .f.invalid').count()>0,true,'the bad fields are marked');
  await p.close();
});

await T('a bad email is refused, a good one is accepted',async()=>{
  const p=await open();
  await p.fill('[name="full_name"]','Maria Santos');
  await p.check('input[name="profile"][value="founder"]');
  for(const bad of ['maria','maria@','@example.com','maria example.com']){
    await p.fill('[name="email"]',bad);
    await p.locator('.step[data-step="1"] [data-next]').click();
    ok(await p.locator('.step[data-step="1"]').evaluate(e=>e.classList.contains('on')),
       `should refuse ${bad}`);
  }
  await p.fill('[name="email"]','maria@example.com');
  await p.locator('.step[data-step="1"] [data-next]').click();
  ok(await p.locator('.step[data-step="2"]').evaluate(e=>e.classList.contains('on')),'advanced');
  await p.close();
});

await T('choosing nothing in a radio group blocks the step',async()=>{
  const p=await open();
  await p.fill('[name="full_name"]','Maria Santos');
  await p.fill('[name="email"]','maria@example.com');
  await p.locator('.step[data-step="1"] [data-next]').click();
  ok(await p.locator('.step[data-step="1"]').evaluate(e=>e.classList.contains('on')),
     '"Which best describes you?" is required');
  await p.close();
});

await T('Back returns without losing what was typed',async()=>{
  const p=await open();
  await toStep3(p);
  await p.locator('.step[data-step="3"] [data-prev]').click();
  await p.locator('.step[data-step="2"] [data-prev]').click();
  eq(await p.locator('[name="full_name"]').inputValue(),'Maria Santos','step 1 kept');
  await p.close();
});

await T('Enter advances a step instead of submitting early',async()=>{
  const p=await open();
  await p.fill('[name="full_name"]','Maria Santos');
  await p.fill('[name="email"]','maria@example.com');
  await p.check('input[name="profile"][value="founder"]');
  await p.locator('[name="email"]').press('Enter');
  ok(await p.locator('.step[data-step="2"]').evaluate(e=>e.classList.contains('on')),'moved on');
  eq((await writes(p)).length,0,'and submitted nothing');
  await p.close();
});

/* --------------------------------------------------------------- consent */

await T('consent is required, and is never pre-ticked',async()=>{
  const p=await open();
  await toStep3(p);
  eq(await p.locator('[name="consent"]').isChecked(),false,'a pre-ticked consent box is not consent');
  await p.locator('[type=submit]').click();
  eq((await writes(p)).length,0,'nothing written without it');
  await p.close();
});

await T('consent is written as a real boolean, not the string "yes"',async()=>{
  const p=await open();
  await toStep3(p);
  await p.check('[name="consent"]');
  await p.locator('[type=submit]').click();
  await p.waitForURL('**/register-success.html',{timeout:9000});
  const w=(await writes(p))[0];
  ok(w,'the write must have happened before the success page');
  eq(w.consent,true,'the rules demand consent == true, a boolean');
  eq(w.updates,false,'and an unticked opt-in is false, not absent');
  await p.close();
});

/* ---------------------------------------------------------------- the write */

await T('the write carries the event ID as well as the title',async()=>{
  const p=await open();
  await toStep3(p);
  await p.check('[name="consent"]');
  await p.locator('[type=submit]').click();
  await p.waitForURL('**/register-success.html',{timeout:9000});
  const w=(await writes(p))[0];
  ok(w,'the write must have happened before the success page');
  eq(w.eventId,'2026-10-ai-exchange',
     'without the id, a per-event list has only a typed title to join on — and they do not match');
  eq(w.event,'PAAIPE AI Exchange — October 2026','the title an administrator reads on a row');
  eq(w.full_name,'Maria Santos','name');
  eq(w.email,'maria@example.com','email');
  eq(w.profile,'founder','profile');
  await p.close();
});

await T('SUCCESS IS ONLY SHOWN IF THE WRITE RESOLVED',async()=>{
  for(const mode of ['permission-denied','network']){
    const p=await open({failWith:mode});
    await toStep3(p);
    await p.check('[name="consent"]');
    await p.locator('[type=submit]').click();
    await p.waitForFunction(()=>document.getElementById('submit-error')?.style.display==='block',{timeout:5000});
    ok(!/register-success/.test(p.url()),`${mode}: must NOT reach the success page`);
    const t=await p.locator('#submit-error').innerText();
    ok(/Nothing was saved/i.test(t),`${mode}: must say nothing was saved — ${t}`);
    ok(await p.locator('[type=submit]').isEnabled(),`${mode}: and let them try again`);
    await p.close();
  }
});

await T('a refusal for LENGTH says so, not "check your connection"',async()=>{
  // permission-denied on this collection almost always means a field exceeded a
  // rules cap. Telling somebody to check their connection sends them to fix the
  // wrong thing.
  const p=await open({failWith:'permission-denied'});
  await toStep3(p);
  await p.check('[name="consent"]');
  await p.locator('[type=submit]').click();
  await p.waitForFunction(()=>document.getElementById('submit-error')?.style.display==='block',{timeout:5000});
  const t=await p.locator('#submit-error').innerText();
  ok(/too long|shorten/i.test(t),`should point at the real cause: ${t}`);
  ok(!/connection/i.test(t),'and not blame the network');
  await p.close();
});

await T('when registration is not connected it says so and saves nothing',async()=>{
  const p=await open({configured:false});
  await toStep3(p);
  await p.check('[name="consent"]');
  await p.locator('[type=submit]').click();
  await p.waitForFunction(()=>document.getElementById('submit-error')?.style.display==='block',{timeout:5000});
  const t=await p.locator('#submit-error').innerText();
  ok(/not connected/i.test(t)&&/Nothing was saved/i.test(t),`${t}`);
  eq((await writes(p)).length,0,'and never reached the writer');
  await p.close();
});

await T('the honeypot stores nothing and does not explain itself',async()=>{
  const p=await open();
  await toStep3(p);
  await p.check('[name="consent"]');
  await p.evaluate(()=>{document.querySelector('[name=website]').value='http://spam.example'});
  await p.locator('[type=submit]').click();
  await p.waitForURL('**/register-success.html',{timeout:5000});
  eq((await writes(p)).length,0,
     'nothing reaches Firestore — and this reads sessionStorage, which SURVIVES the '+
     'navigation, so it cannot pass merely because window.__writes is gone');
  await p.close();
});

/* ------------------------------------------ the form and the rules must agree */

await T('every field\'s maxlength matches the cap the rules enforce',()=>{
  // A field the form lets you overflow is a registration the rules refuse, and
  // the person is told to check their connection. They have to agree.
  const caps={full_name:120,email:254,position:160,organization:160,
              profile_other:160,learn:2000,speaker_question:2000};
  for(const [name,cap] of Object.entries(caps)){
    const m=new RegExp(`name="${name}"[^>]*maxlength="(\\d+)"|maxlength="(\\d+)"[^>]*name="${name}"`).exec(HTML);
    ok(m,`${name} has no maxlength in the form`);
    const got=Number(m[1]||m[2]);
    eq(got,cap,`${name}: the form allows ${got} and the rules cap ${cap}`);
    ok(new RegExp(`d\\.${name}[^\\n]*<= ${cap}`).test(RULES),`the rules really cap ${name} at ${cap}`);
  }
});

await T('the rules let anyone register and nobody but an admin read it',()=>{
  const b=RULES.slice(RULES.indexOf('match /paaipe_event_registrations/'),
                      RULES.indexOf('function isWellFormedRegistration'));
  ok(/allow create: if isWellFormedRegistration/.test(b),'anyone may create one');
  ok(/allow read: if isAdmin\(\)/.test(b),'only an administrator may read - RA 10173');
  ok(/allow delete: if false/.test(b),'nobody deletes what somebody submitted');
  const m=/hasOnly\(\[([^\]]*)\]\)/s.exec(b);
  ok(m,'updates are key-limited');
  for(const theirs of ['full_name','email','learn','speaker_question','consent','organization'])
    ok(!m[1].includes(theirs),`an administrator must never rewrite ${theirs}`);
});

await T('consent must be a real boolean true in the rules, not "yes"',()=>{
  const f=RULES.slice(RULES.indexOf('function isWellFormedRegistration'));
  ok(/d\.consent == true/.test(f),'a string "yes" must not pass for consent');
  ok(/d\.createdAt == request\.time/.test(f),'and nothing may be backdated');
});

/* ---------------------------------------------------------- the focus trap */

await T('the deferred focus cannot steal a field somebody is already typing in',()=>{
  // A deferred focus() once submitted this form EMPTY under load. The guard is
  // the activeElement check; without it the timer fires into whatever the
  // person had already started filling.
  const m=/setTimeout\(\(\)=>\{const a=document\.activeElement;if\(!a\|\|a===document\.body\)/.exec(HTML);
  ok(m,'the focus timer must check activeElement before taking focus');
});

/* ------------------------------------------------------- the success page */

await T('November and December register pages clone October with only identity swapped',()=>{
  for(const [file,id,title,date] of [
    ['register-2026-11-ai-exchange.html','2026-11-ai-exchange','PAAIPE AI Exchange — November 2026','Tuesday, November 10, 2026'],
    ['register-2026-12-ai-exchange.html','2026-12-ai-exchange','PAAIPE AI Exchange — December 2026','Tuesday, December 8, 2026'],
  ]){
    const html=readFileSync(`${ROOT}/${file}`,'utf8');
    ok(html.includes(`name="event_id" value="${id}"`),`${file} event_id`);
    ok(html.includes(`name="event" value="${title}"`),`${file} event title`);
    ok(html.includes(date),`${file} date`);
    ok(/location\.href='register-success\.html'/.test(html),`${file} same success redirect`);
    ok(/fb\.submitRegistration/.test(html),`${file} same submit path`);
    ok(html.includes('paaipe-register-from-portal.js'),`${file} shared portal prefill`);
    ok(html.includes('data-register-back'),`${file} back hook`);
    ok(!/2026-10-ai-exchange/.test(html),`${file} must not keep October id`);
  }
});

await T('November and December event pages host a live Register now like October',()=>{
  for(const [file,reg] of [
    ['event-2026-11-ai-exchange.html','register-2026-11-ai-exchange.html'],
    ['event-2026-12-ai-exchange.html','register-2026-12-ai-exchange.html'],
  ]){
    const html=readFileSync(`${ROOT}/${file}`,'utf8');
    ok(html.includes(`data-register-href="${reg}"`),`${file} href attribute`);
    ok(html.includes(`<a class="btn btn-gold" href="${reg}">Register now</a>`),`${file} live link`);
    ok(html.includes('Free to register. Your join link is sent by email after you register.'),`${file} note`);
    ok(!/Registration opens soon/.test(html),`${file} opens soon is gone`);
  }
});

await T('the success page does not promise mail PAAIPE cannot send',()=>{
  const s=readFileSync(`${ROOT}/register-success.html`,'utf8');
  ok(/Check your email/i.test(s),'it does currently tell them to check their email');
  ok(/assets\/2026-10-ai-exchange\.ics/.test(s),'and offers the calendar file, which is real');
});

await T('October also loads the shared portal prefill module',()=>{
  ok(HTML.includes('paaipe-register-from-portal.js'),'module on October');
  ok(HTML.includes('data-register-back'),'back hook on October');
});

await T('a public visitor is left a blank, editable name and email',async()=>{
  const p=await open();
  eq(await p.locator('[name="full_name"]').inputValue(),'','name blank');
  eq(await p.locator('[name="email"]').inputValue(),'','email blank');
  eq(await p.locator('[name="full_name"]').evaluate(el=>el.readOnly),false,'name editable');
  eq(await p.locator('[name="email"]').evaluate(el=>el.readOnly),false,'email editable');
  eq(await p.locator('[data-register-back]').getAttribute('href'),
     'event-2026-10-ai-exchange.html','public back');
  eq(await p.locator('html').getAttribute('data-register-from'),'public','no portal hint');
  await p.close();
});

await T('a signed-in Agent gets a locked account name and email, without ?from=portal',async()=>{
  const p=await open({signedIn:true,email:'rosa@example.com',name:'Rosa Villanueva'});
  eq(await p.locator('[name="full_name"]').inputValue(),'Rosa Villanueva','name');
  eq(await p.locator('[name="email"]').inputValue(),'rosa@example.com','email');
  eq(await p.locator('[name="full_name"]').evaluate(el=>el.readOnly),true,'name locked');
  eq(await p.locator('[name="email"]').evaluate(el=>el.readOnly),true,'email locked');
  eq(await p.locator('[data-register-back]').getAttribute('href'),
     'event-2026-10-ai-exchange.html','signed-in from the public site still goes to the public event');
  eq(await p.locator('html').getAttribute('data-register-prefill'),'signed-in','prefill mark');
  await p.close();
});

await T('?from=portal sends Back to portal Event Details, even before auth',async()=>{
  const p=await open({query:'?from=portal&event=2026-10-ai-exchange'});
  eq(await p.locator('[data-register-back]').getAttribute('href'),
     'portal-events.html#event=2026-10-ai-exchange','portal Event Details');
  eq(await p.locator('html').getAttribute('data-register-from'),'portal','hint');
  eq(await p.locator('[name="email"]').inputValue(),'','visitor still blank');
  await p.close();
});

await T('a signed-in Agent arriving from the portal keeps the locked fields and portal back',async()=>{
  const p=await open({
    signedIn:true,email:'rosa@example.com',name:'Rosa Villanueva',
    query:'?from=portal&event=2026-11-ai-exchange',
    page:'register-2026-11-ai-exchange.html',
  });
  eq(await p.locator('[name="full_name"]').inputValue(),'Rosa Villanueva','name');
  eq(await p.locator('[name="email"]').inputValue(),'rosa@example.com','email');
  eq(await p.locator('[data-register-back]').getAttribute('href'),
     'portal-events.html#event=2026-11-ai-exchange','November Event Details');
  await p.close();
});

await T('the locked account fields are what the write stores',async()=>{
  const p=await open({signedIn:true,email:'rosa@example.com',name:'Rosa Villanueva'});
  await p.check('input[name="profile"][value="founder"]');
  await p.locator('.step[data-step="1"] [data-next]').click();
  await p.fill('[name="learn"]','How to start');
  await p.locator('.step[data-step="2"] [data-next]').click();
  await p.selectOption('[name="source"]','GetHired');
  await p.check('[name="consent"]');
  await p.locator('[type=submit]').click();
  await p.waitForURL('**/register-success.html',{timeout:9000});
  const w=(await writes(p))[0];
  ok(w,'the write must have happened');
  eq(w.full_name,'Rosa Villanueva','account name, not a typed one');
  eq(w.email,'rosa@example.com','account email, not a typed one');
  await p.close();
});

await T('portal Register CTAs pass from=portal and the event id',()=>{
  const portal=readFileSync(`${ROOT}/portal-events.html`,'utf8');
  ok(portal.includes('register-2026-11-ai-exchange.html?from=portal&amp;event=2026-11-ai-exchange')
     || portal.includes('register-2026-11-ai-exchange.html?from=portal&event=2026-11-ai-exchange'),
     'November list CTA');
  ok(portal.includes('register-2026-12-ai-exchange.html?from=portal&amp;event=2026-12-ai-exchange')
     || portal.includes('register-2026-12-ai-exchange.html?from=portal&event=2026-12-ai-exchange'),
     'December list CTA');
  const js=readFileSync(`${ROOT}/assets/js/paaipe-portal-events.js`,'utf8');
  ok(js.includes('function registerFromPortalHref'),'shared CTA helper');
  ok(js.includes('registerFromPortalHref(ev.registerHref, ev.id)'),'Event Details uses it');
});

await T('helpers map the portal hint onto Event Details and leave the public back alone',async()=>{
  const p=await open();
  const r=await p.evaluate(async()=>{
    const m=await import('/assets/js/paaipe-register-from-portal.js');
    return {
      hint: m.isPortalRegisterContext('?from=portal&event=2026-12-ai-exchange'),
      public: m.isPortalRegisterContext(''),
      id: m.eventIdFromRegisterPage(document, '?from=portal&event=2026-12-ai-exchange'),
      formId: m.eventIdFromRegisterPage(document, ''),
      back: m.portalBackHref('2026-12-ai-exchange'),
    };
  });
  eq(r.hint,true,'from=portal');
  eq(r.public,false,'no hint');
  eq(r.id,'2026-12-ai-exchange','query event');
  eq(r.formId,'2026-10-ai-exchange','form fallback');
  eq(r.back,'portal-events.html#event=2026-12-ai-exchange','#37 Event Details');
  const url=await p.evaluate(async()=>{
    const u=await import('/assets/js/paaipe-portal-event-url.js');
    return {
      page: u.PORTAL_EVENT_DETAIL.PAGE,
      idKey: u.PORTAL_EVENT_DETAIL.ID_KEY,
      form: u.PORTAL_EVENT_DETAIL.FORM,
      href: u.portalEventDetailHref('2026-12-ai-exchange'),
      hrefFb: u.portalEventDetailHref('2026-09-ai-exchange','feedback'),
    };
  });
  eq(url.page,'portal-events.html','PAGE is the live list');
  eq(url.idKey,'event','ID_KEY is #event=');
  eq(url.form,'hash','FORM is hash until Ericson lands query');
  eq(url.href,r.back,'Register Back and the URL helper are the same address');
  eq(url.hrefFb,'portal-events.html#event=2026-09-ai-exchange&tab=feedback','tab stays on #37');
  ok(!existsSync(`${ROOT}/portal-event.html`),
     'do not invent the dedicated page on this PR');
  await p.close();
});

await T('no console errors',()=>ok(errs.length===0,errs.join(' | ')));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
