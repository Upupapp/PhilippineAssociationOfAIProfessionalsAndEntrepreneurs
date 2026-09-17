/* The event workspace: one event, seven tabs, everything event-scoped inside it. */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const BASE=process.env.PAAIPE_BASE||'http://127.0.0.1:8899', ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
const REAL_FB=readFileSync(`${ROOT}/assets/js/paaipe-firebase.js`,'utf8');
const REAL_DATA=readFileSync(`${ROOT}/assets/js/paaipe-events-data.js`,'utf8');
let pass=0,fail=0;
const T=async(n,f)=>{try{await f();console.log(`  PASS  ${n}`);pass++}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++}};
const ok=(c,m)=>{if(!c)throw new Error(m)};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)};

const EV={id:'e-oct',slug:'event-2026-10-ai-exchange',title:'AI Exchange — October 2026',
  status:'registration_open',date:'2026-10-13',startTime:'20:00',endTime:'21:30',capacity:500,
  timezone:'Asia/Manila',bannerWideUrl:'assets/img/world-dots.png',bannerSquareUrl:'assets/img/paaipe-logo.png',
  gallery:[{url:'assets/img/world-dots.png',alt:'Room',caption:'The room',order:0},
           {url:'assets/img/paaipe-logo.png',alt:'Speaker',caption:'',order:1}]};
const ORGS=[{id:'gethired',name:'GetHired Online',website:'https://gethired.ph',status:'active',logoUrl:'g.png'},
            {id:'servana',name:'Servana',website:'https://servana.app',status:'active',logoUrl:'s.png'}];

const fbStub=`export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return {uid:'a1',email:'admin@upupapp.asia',status:'guest'}}
  export async function isAdminNow(){return true}
  export async function signOutNow(){}`;

const dataStub=({events=[EV],orgs=ORGS,sponsors=[],apps=[],regs=[]}={})=>`
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function listEvents(){ return ${JSON.stringify(events)} }
  export async function listOrganizations(){ return ${JSON.stringify(orgs)} }
  export async function listEventSponsors(){ return ${JSON.stringify(sponsors)} }
  export async function listPartnerApplicationsFor(){ return ${JSON.stringify(apps)} }
  export async function listAllRegistrations(){ return ${JSON.stringify(regs)} }`;

const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:1400,height:1000}});
const errs=[];
async function open(opts={}){
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub(opts)}));
  await p.goto(`${BASE}/admin-events.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-admin-events]',{timeout:9000});
  await p.click('tr[data-event="e-oct"] [data-edit-event]');
  await p.waitForSelector('[data-event-tabs] button',{timeout:9000});
  return p;
}

await T('the workspace has the seven tabs the brief names, in order',async()=>{
  const p=await open();
  const keys=await p.$$eval('[data-event-tabs] button',b=>b.map(x=>x.dataset.tab));
  eq(keys,['details','media','sponsors','applications','registrations','email','settings'],'tab order');
  const sponsorTab=(await p.locator('[data-tab="sponsors"]').innerText()).trim();
  ok(/Partners/.test(sponsorTab),`tab label should be Partners: ${sponsorTab}`);
  ok(!/Sponsors/.test(sponsorTab),`tab label must not still say Sponsors: ${sponsorTab}`);
  await p.close();
});

await T('Details is the tab you land on',async()=>{
  const p=await open();
  eq(await p.getAttribute('[data-tab="details"]','aria-selected'),'true','selected');
  ok(await p.locator('[data-tabpanel="details"]').isVisible(),'details shown');
  ok(!(await p.locator('[data-tabpanel="sponsors"]').isVisible()),'others hidden');
  await p.close();
});

await T('the tab is in the URL, so a link to one is a link you can send',async()=>{
  const p=await open();
  await p.click('[data-tab="media"]');
  ok(/tab=media/.test(p.url()),`the hash should carry it: ${p.url()}`);
  ok(/event=e-oct/.test(p.url()),'and which event');
  await p.close();
});

await T('the Publish panel stays put on every tab',async()=>{
  const p=await open();
  for(const t of ['details','media','sponsors','applications','registrations','settings']){
    await p.click(`[data-tab="${t}"]`);
    ok(await p.locator('[data-publish-rail] [data-save-event]').isVisible(),`Save missing on ${t}`);
    ok(await p.locator('[data-publish-rail] [data-ics]').isVisible(),`calendar missing on ${t}`);
  }
  await p.close();
});

await T('a field edited on one tab is still there after visiting another',async()=>{
  const p=await open();
  await p.click('[data-tab="settings"]');
  await p.fill('[data-e="confirmationEmailText"]','Changed on the Settings tab');
  await p.click('[data-tab="details"]');
  await p.fill('[data-e="title"]','Changed on Details');
  await p.click('[data-tab="media"]');
  await p.click('[data-tab="settings"]');
  eq(await p.locator('[data-e="confirmationEmailText"]').inputValue(),'Changed on the Settings tab','settings kept');
  await p.click('[data-tab="details"]');
  eq(await p.locator('[data-e="title"]').inputValue(),'Changed on Details','details kept');
  await p.close();
});

await T('BREAK-CHECK: Save reads the WHOLE workspace, not the visible tab',async()=>{
  const p=await open();
  await p.click('[data-tab="settings"]');
  await p.fill('[data-e="confirmationEmailText"]','Written while Settings was open');
  await p.click('[data-tab="details"]');
  const patch=await p.evaluate(()=>{
    const d=document.querySelector('[data-editor-cols]');
    return d.querySelector('[data-e="confirmationEmailText"]')?.value;
  });
  eq(patch,'Written while Settings was open',
     'if Save scoped to the visible panel this value would be invisible to it');
  await p.close();
});

await T('Media shows both banner variants and the photos it has',async()=>{
  const p=await open();
  await p.click('[data-tab="media"]');
  eq(await p.locator('[data-ph]').count(),2,'two photos');
  eq((await p.locator('[data-ph-count]').innerText()).trim(),'2','the counter agrees');
  ok(await p.locator('.mbox.sq img').isVisible(),'square preview');
  ok(await p.locator('.mbox.wide img').isVisible(),'wide preview');
  await p.close();
});

await T('Media says plainly that uploading needs a bucket that does not exist',async()=>{
  const p=await open();
  await p.click('[data-tab="media"]');
  await p.waitForSelector('[data-media-upload] .flash, [data-banner-file]',{timeout:9000});
  const t=await p.locator('[data-media-upload]').innerText();
  ok(/no storage bucket|does not exist/i.test(t),`should say why: ${t}`);
  eq(await p.locator('[data-banner-file]').count(),0,
     'a file input that threw on pick is worse than none');
  ok(/assets\/img\//.test(t),'and point at what does work today');
  await p.close();
});

await T('a sixth photo is refused, and says why',async()=>{
  const p=await open({events:[{...EV,gallery:[0,1,2,3,4].map(i=>({url:`assets/img/paaipe-logo.png`,alt:`Photo ${i}`,order:i}))}]});
  await p.click('[data-tab="media"]');
  eq(await p.locator('[data-ph]').count(),5,'five to start');
  p.once('dialog',d=>d.accept('x.jpg'));
  await p.click('[data-ph-add]');
  eq(await p.locator('[data-ph]').count(),5,'still five');
  ok(/limit/i.test(await p.locator('[data-flash]').innerText()),'and it says so');
  await p.close();
});

await T('a photo can be reordered and removed',async()=>{
  const p=await open();
  await p.click('[data-tab="media"]');
  eq(await p.locator('[data-ph-alt]').first().inputValue(),'Room','starts first');
  await p.locator('[data-ph]').nth(1).locator('[data-ph-up]').click();
  eq(await p.locator('[data-ph-alt]').first().inputValue(),'Speaker','moved up');
  await p.locator('[data-ph]').first().locator('[data-ph-rm]').click();
  eq(await p.locator('[data-ph]').count(),1,'removed');
  eq((await p.locator('[data-ph-count]').innerText()).trim(),'1','counter follows');
  await p.close();
});

await T('Sponsors manages this event inline, with no link-out to do the work',async()=>{
  const p=await open({sponsors:[
    {id:'s1',eventId:'e-oct',organizationId:'gethired',tier:'presenting',status:'confirmed',order:10},
    {id:'s2',eventId:'e-oct',organizationId:'servana',tier:'community',status:'proposed',order:20}]});
  await p.click('[data-tab="sponsors"]');
  await p.waitForSelector('[data-sp-row]',{timeout:9000});
  eq(await p.locator('[data-sp-row]').count(),2,'both rows');
  ok(await p.locator('[data-sp-row="s1"] [data-sp-tier]').isVisible(),'tier is editable here');
  ok(await p.locator('[data-sp-row="s1"] [data-sp-status]').isVisible(),'and status');
  ok(await p.locator('[data-sp-row="s1"] [data-sp-save]').isVisible(),'and saved here');
  await p.close();
});

await T('the placement preview shows CONFIRMED only, and counts what is hidden',async()=>{
  const p=await open({sponsors:[
    {id:'s1',eventId:'e-oct',organizationId:'gethired',tier:'presenting',status:'confirmed',order:10},
    {id:'s2',eventId:'e-oct',organizationId:'servana',tier:'community',status:'proposed',order:20}]});
  await p.click('[data-tab="sponsors"]');
  await p.waitForSelector('.ppreview',{timeout:9000});
  const t=await p.locator('.ppreview').innerText();
  ok(/PRESENTED WITH/.test(t),'the confirmed one is drawn');
  ok(/1 Partner on this event is hidden/.test(t),`and the proposed one is counted, not drawn: ${t}`);
  eq(await p.locator('.ppreview img[alt="Servana"]').count(),0,'a proposed sponsor must not be rendered');
  await p.close();
});

await T('the tier limits are enforced in the picker, not just on save',async()=>{
  const p=await open({sponsors:[
    {id:'s1',eventId:'e-oct',organizationId:'gethired',tier:'presenting',status:'confirmed',order:10}]});
  await p.click('[data-tab="sponsors"]');
  await p.waitForSelector('[data-sp-row]',{timeout:9000});
  const own=await p.locator('[data-sp-row="s1"] [data-sp-tier] option[value="presenting"]').isDisabled();
  eq(own,false,'the row that HOLDS presenting must still be able to keep it');
  await p.close();
});

await T('creating an organization inline is offered, and explains what it writes',async()=>{
  const p=await open();
  await p.click('[data-tab="sponsors"]');
  await p.waitForSelector('[data-new-org-toggle]',{timeout:9000});
  ok(!(await p.locator('[data-new-org]').isVisible()),'starts closed');
  await p.click('[data-new-org-toggle]');
  ok(await p.locator('[data-no-name]').isVisible(),'the form opens');
  const t=await p.locator('[data-tabpanel="sponsors"]').innerText();
  ok(/shared organization record/i.test(t),'says it writes the shared record');
  ok(/inactive/i.test(t)&&/proposed/i.test(t),'and that nothing is public yet');
  await p.close();
});

await T('removing a sponsor never offers to remove the organization',()=>{
  const js=readFileSync(`${ROOT}/assets/js/paaipe-admin-events.js`,'utf8');
  const fn=js.slice(js.indexOf('async function removeSponsorRow'),js.indexOf('async function linkRegistration'));
  ok(/COL\.sponsors/.test(fn),'it deletes the sponsorship');
  ok(!/COL\.organizations/.test(fn),
     'an organization is credited on other events and on the public Partners page');
  ok(/organization is kept|organization itself is kept/i.test(fn),'and the confirm says so');
});

/* ------------------------------------- the registration -> event linkage
 * Measured on the live database: rows say "PAAIPE AI Exchange — October 2026"
 * and the event record is titled "AI Exchange — October 2026". An exact join
 * returns nothing, so this tab would have shown zero for an event with three. */
await T('a registration with an eventId belongs to that event and no other',async()=>{
  const p=await open();
  const r=await p.evaluate(async()=>{
    const m=await import('/assets/js/paaipe-events-data.js');
    const ev={id:'e-oct',title:'AI Exchange — October 2026'};
    return {
      byId:      m.registrationMatchesEvent({eventId:'e-oct',event:'anything at all'},ev),
      otherId:   m.registrationMatchesEvent({eventId:'e-nov',event:'AI Exchange — October 2026'},ev),
      legacy:    m.registrationMatchesEvent({event:'PAAIPE AI Exchange — October 2026'},ev),
      exact:     m.registrationMatchesEvent({event:'AI Exchange — October 2026'},ev),
      wrong:     m.registrationMatchesEvent({event:'AI Exchange — November 2026'},ev),
      empty:     m.registrationMatchesEvent({event:''},ev),
      unlinkedA: m.isUnlinked({eventId:'e-oct'}),
      unlinkedB: m.isUnlinked({event:'x'}),
    };
  });
  eq(r.byId,true,'the id wins over whatever title was typed');
  eq(r.otherId,false,'an id for ANOTHER event must not match on the title');
  eq(r.legacy,true,'the live rows say "PAAIPE ..." and must still be found');
  eq(r.exact,true,'an exactly-titled legacy row too');
  eq(r.wrong,false,'a different month must not match');
  eq(r.empty,false,'and an empty title must not match everything');
  eq(r.unlinkedA,false,'a row with an id is linked');
  eq(r.unlinkedB,true,'a row without one is not');
  await p.close();
});

await T('legacy registrations are shown and FLAGGED, never dropped',async()=>{
  const p=await open({regs:[
    {id:'r1',eventId:'e-oct',full_name:'Linked Lily',email:'l@x.com',status:'registered'},
    {id:'r2',event:'PAAIPE AI Exchange — October 2026',full_name:'Legacy Leo',email:'g@x.com'},
    {id:'r3',event:'AI Exchange — November 2026',full_name:'Other Olive',email:'o@x.com'}]});
  await p.click('[data-tab="registrations"]');
  await p.waitForSelector('[data-tabpanel="registrations"] table',{timeout:9000});
  const t=await p.locator('[data-tabpanel="registrations"]').innerText();
  ok(/Linked Lily/.test(t),'the linked one');
  ok(/Legacy Leo/.test(t),'the legacy one must NOT vanish');
  ok(!/Other Olive/.test(t),"but another event's registrant must not appear");
  ok(/UNLINKED/.test(t),'the legacy one is flagged');
  ok(/predate event ids/i.test(t),'and the reason is on the page');
  eq(await p.locator('[data-link-reg="r2"]').count(),1,'with a way to fix it');
  eq(await p.locator('[data-link-reg="r1"]').count(),0,'and none offered for the one already linked');
  await p.close();
});

await T('the registration FORM now sends an event id',()=>{
  const html=readFileSync(`${ROOT}/register-2026-10-ai-exchange.html`,'utf8');
  ok(/name="event_id" value="2026-10-ai-exchange"/.test(html),'the hidden field');
  ok(/eventId:g\('event_id'\)/.test(html),'and it reaches the write');
});

await T('the rules accept eventId on create and let an ADMIN backfill it',()=>{
  const rules=readFileSync(`${ROOT}/firestore.rules`,'utf8');
  ok(/'eventId' in d\.keys\(\)/.test(rules),'allowed on create');
  const upd=rules.slice(rules.indexOf('match /paaipe_event_registrations/'),
                        rules.indexOf('function isWellFormedRegistration'));
  const m=/hasOnly\(\[([^\]]*)\]\)/s.exec(upd);
  ok(m&&m[1].includes('eventId'),'an administrator may set it');
  for(const theirs of ['full_name','email','learn','consent'])
    ok(!m[1].includes(theirs),`an admin must still not rewrite ${theirs}`);
});

await T('Registrations and Applications load inside the event',async()=>{
  const p=await open();
  await p.click('[data-tab="applications"]');
  await p.waitForFunction(()=>!/Loading/.test(document.querySelector('[data-tabpanel="applications"]')?.innerText||'Loading'),{timeout:9000});
  ok(/[Pp]artner applications/.test(await p.locator('[data-tabpanel="applications"]').innerText()),'applications tab');
  await p.click('[data-tab="registrations"]');
  await p.waitForFunction(()=>!/Loading/.test(document.querySelector('[data-tabpanel="registrations"]')?.innerText||'Loading'),{timeout:9000});
  ok(/Registrations/.test(await p.locator('[data-tabpanel="registrations"]').innerText()),'registrations tab');
  await p.close();
});

await T('History humanizes sponsor.* keys to Partner language without renaming them',()=>{
  const js=readFileSync(`${ROOT}/assets/js/paaipe-admin-events.js`,'utf8');
  ok(/logActivity\("sponsor\.create"/.test(js),'create key unchanged');
  ok(/logActivity\("sponsor\.update"/.test(js),'update key unchanged');
  ok(/logActivity\("sponsor\.remove"/.test(js),'remove key unchanged');
  ok(/"sponsor\.create":\s*"Partner added"/.test(js),'display: Partner added');
  ok(/"sponsor\.update":\s*"Partner updated"/.test(js),'display: Partner updated');
  ok(/"sponsor\.remove":\s*"Partner removed"/.test(js),'display: Partner removed');
  ok(/ACTION_LABEL\[r\.action\]/.test(js),'History uses the display map, not the raw key');
});

await T('a failed read says so and never renders as "none"',()=>{
  const js=readFileSync(`${ROOT}/assets/js/paaipe-admin-events.js`,'utf8');
  for(const [fn,phrase] of [['loadSponsorsTab','not "no Partners"'],
                            ['loadApplicationsTab','not "no applications"'],
                            ['loadRegistrationsTab','not "nobody registered"'],
                            ['loadEmailTab','not "nobody registered"']]){
    const body=js.slice(js.indexOf(`async function ${fn}`),js.indexOf(`async function ${fn}`)+1400);
    ok(body.includes(phrase),`${fn} must distinguish a failure from an empty list`);
  }
});

await T('a tab count that could not be taken shows NO badge, never a zero',()=>{
  const js=readFileSync(`${ROOT}/assets/js/paaipe-admin-events.js`,'utf8');
  const fn=js.slice(js.indexOf('function renderTabs'),js.indexOf('function setTabCount'));
  ok(/n === null/.test(fn),'null is handled explicitly');
  ok(/not counted yet|never told you|must not render as a zero/i.test(fn),'and the reason is written down');
});

await T("opening another event does not show the first one's rows",()=>{
  const js=readFileSync(`${ROOT}/assets/js/paaipe-admin-events.js`,'utf8');
  const fn=js.slice(js.indexOf('function openEditor'),js.indexOf('function openEditor')+700);
  ok(/SPONSORS = \[\]/.test(fn)&&/APPS = \[\]/.test(fn)&&/REGS = \[\]/.test(fn),
     'the per-event caches must be cleared, or stale rows look like data');
});

await T('no console errors',()=>ok(errs.length===0,errs.join(' | ')));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
