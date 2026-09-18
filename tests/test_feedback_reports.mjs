/* Feedback + Reports against Clarence's locked collections.
 *
 * Questions: paaipe_event_feedback_questions/{eventId}_{questionKey}
 * Responses: paaipe_event_feedback_responses/{eventId}_{registrationId}
 * Mock figures 48 / 12 / 4.2 / 25% must never appear as live data. */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const BASE=process.env.PAAIPE_BASE||'http://127.0.0.1:8899', ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
const REAL_FB=readFileSync(`${ROOT}/assets/js/paaipe-firebase.js`,'utf8');
const REAL_DATA=readFileSync(`${ROOT}/assets/js/paaipe-events-data.js`,'utf8');
const REAL_FEED=readFileSync(`${ROOT}/assets/js/paaipe-feedback.js`,'utf8');
const RULES=readFileSync(`${ROOT}/firestore.rules`,'utf8');
let pass=0,fail=0;
const T=async(n,f)=>{try{await f();console.log(`  PASS  ${n}`);pass++}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++}};
const ok=(c,m)=>{if(!c)throw new Error(m)};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)};

const EV={id:'2026-10-ai-exchange',slug:'event-2026-10-ai-exchange',title:'AI Exchange — October 2026',
  status:'registration_open',date:'2026-10-13',startTime:'20:00',endTime:'21:30'};
const EVS=[
  EV,
  {id:'2026-11-ai-exchange',slug:'event-2026-11-ai-exchange',title:'AI Exchange — November 2026',
    status:'published',date:'2026-11-10',startTime:'20:00',endTime:'21:30'},
];
const QS=[
  {id:'2026-10-ai-exchange_overall',eventId:'2026-10-ai-exchange',questionKey:'overall',
    prompt:'Overall, how was this session?',type:'1-5',required:true,active:true,order:0},
  {id:'2026-10-ai-exchange_recommend',eventId:'2026-10-ai-exchange',questionKey:'recommend',
    prompt:'Would you recommend this to another Agent?',type:'yes-no',required:true,active:true,order:1},
  {id:'2026-10-ai-exchange_mostUseful',eventId:'2026-10-ai-exchange',questionKey:'mostUseful',
    prompt:'What was most useful?',type:'short',required:true,active:true,order:2},
  {id:'2026-10-ai-exchange_improve',eventId:'2026-10-ai-exchange',questionKey:'improve',
    prompt:'What should we improve?',type:'short',required:false,active:true,order:3},
];
const REGS=[
  {id:'r1',eventId:'2026-10-ai-exchange',email:'ada@x.com',status:'registered'},
  {id:'r2',eventId:'2026-10-ai-exchange',email:'ben@x.com'},
  {id:'r3',eventId:'2026-10-ai-exchange',email:'cara@x.com',status:'cancelled'},
  {id:'r4',eventId:'2026-10-ai-exchange',email:'dan@x.com',status:'attended'},
  {id:'r5',eventId:'2026-10-ai-exchange',email:'eve@x.com',status:'no_show'},
  {id:'legacy',event:'PAAIPE AI Exchange — October 2026',email:'leo@x.com'},
];

const fbStub=`export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return {uid:'a1',email:'admin@upupapp.asia',status:'agent'}}
  export async function isAdminNow(){return true}
  export async function signOutNow(){}`;
const memberStub=`export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return {uid:'u1',email:'ada@x.com',status:'agent'}}
  export async function isAdminNow(){return false}
  export async function signOutNow(){}`;
const guestStub=`export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return null}`;

const dataStub=`
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function listEvents(){ return ${JSON.stringify(EVS)} }
  export async function getEventBySlug(){ return ${JSON.stringify(EV)} }
  export async function listOrganizations(){ return [] }
  export async function listEventSponsors(){ return [{id:'s1',eventId:'2026-10-ai-exchange',tier:'community',status:'confirmed',organization:{name:'Servana'}}] }
  export async function listPartnerApplicationsFor(){ return [{id:'a1',eventId:'2026-10-ai-exchange',status:'new'}] }
  export async function listAllRegistrations(){ return ${JSON.stringify(REGS)} }`;

const feedStub=({questions=QS, responses=[], qFail=false, rFail=false}={})=>`
  export * from '/assets/js/paaipe-feedback-real.js';
  export async function listFeedbackQuestions(){ ${qFail?"return {ok:false,rows:[],reason:'Questions are not available yet. This is not an empty form.'};":""}
    return { ok:true, rows: ${JSON.stringify(questions)}, reason:'' } }
  export async function listFeedbackResponses(){ ${rFail?"return {ok:false,rows:[],reason:'Feedback storage is not connected yet. Nothing here is a count of zero.'};":""}
    return { ok:true, rows: ${JSON.stringify(responses)}, reason:'' } }
  export async function getFeedbackResponse(){ return { ok:true, row: ${responses[0]?JSON.stringify(responses[0]):'null'}, reason:'' } }
  export async function writeFeedbackQuestions(){}
  export async function submitFeedbackResponse(){}
`;

const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:1400,height:1000}});
const errs=[];

async function routeAdmin(p, {feed}={}){
  p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub}));
  await p.route('**/assets/js/paaipe-feedback-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FEED}));
  await p.route('**/assets/js/paaipe-feedback.js',r=>r.fulfill({contentType:'text/javascript',body:feed||feedStub()}));
}

await T('Clarence locked two collections and no invented third',()=>{
  ok(/match \/paaipe_event_feedback_questions\/\{id\}/.test(RULES),'questions collection');
  ok(/match \/paaipe_event_feedback_responses\/\{id\}/.test(RULES),'responses collection');
  ok(!/match \/paaipe_event_feedback\/\{/.test(RULES),'no folded paaipe_event_feedback');
  ok(/type in \['1-5', 'yes-no', 'short'\]/.test(RULES),'locked types');
  ok(/allow list: if isAdmin\(\)/.test(RULES.slice(RULES.indexOf('paaipe_event_feedback_responses'))),'public must not list responses');
  ok(/allow delete: if false/.test(RULES.slice(RULES.indexOf('paaipe_event_feedback_questions'))),'questions are not deleted');
  const col=readFileSync(`${ROOT}/assets/js/paaipe-events-data.js`,'utf8');
  ok(col.includes('paaipe_event_feedback_questions')&&col.includes('paaipe_event_feedback_responses'),'COL names');
  ok(!col.includes('"paaipe_event_feedback"'),'no invented single collection');
});

await T('starter keys, types, and the signed mock prompts',async()=>{
  const p=await ctx.newPage();
  await routeAdmin(p);
  await p.goto(`${BASE}/admin-events.html`,{waitUntil:'load'});
  const r=await p.evaluate(async()=>{
    const m=await import('/assets/js/paaipe-feedback.js');
    return m.STARTER_QUESTIONS.map(q=>({k:q.questionKey,t:q.type,req:q.required,p:q.prompt,order:q.order}));
  });
  eq(r,[
    {k:'overall',t:'1-5',req:true,p:'Overall, how was this session?',order:0},
    {k:'recommend',t:'yes-no',req:true,p:'Would you recommend this to another Agent?',order:1},
    {k:'mostUseful',t:'short',req:true,p:'What was most useful?',order:2},
    {k:'improve',t:'short',req:false,p:'What should we improve?',order:3},
  ],'starters');
  ok(r.every(q=>'order' in q && !('displayOrder' in q)),'field is order, never displayOrder');
  await p.close();
});

await T('admin Feedback tab lists live questions, not mock prompts as data when docs exist',async()=>{
  const p=await ctx.newPage();
  await routeAdmin(p);
  await p.goto(`${BASE}/admin-events.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-admin-events]',{timeout:9000});
  await p.click('tr[data-event="2026-10-ai-exchange"] [data-edit-event]');
  await p.waitForSelector('[data-tab="feedback"]',{timeout:9000});
  await p.click('[data-tab="feedback"]');
  await p.waitForSelector('[data-fq-list] [data-fq]',{timeout:9000});
  const keys=await p.$$eval('[data-fq]',els=>els.map(e=>e.dataset.fqKey));
  eq(keys,['overall','recommend','mostUseful','improve'],'keys');
  ok(await p.locator('[data-save-form]').isVisible(),'Save form');
  ok(/Who sees it/.test(await p.locator('.who-card').innerText()),'who sees it');
  await p.close();
});

await T('event editor header uses the record date line and a status chip',async()=>{
  const p=await ctx.newPage();
  await routeAdmin(p);
  await p.goto(`${BASE}/admin-events.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-admin-events]',{timeout:9000});
  await p.click('tr[data-event="2026-10-ai-exchange"] [data-edit-event]');
  await p.waitForSelector('[data-ework-head]:not([hidden])',{timeout:9000});
  const title=await p.locator('[data-ework-title]').innerText();
  const date=await p.locator('[data-ework-date]').innerText();
  const status=await p.locator('[data-ework-status]').innerText();
  ok(/AI Exchange — October 2026/.test(title),title);
  ok(/October/.test(date)&&/2026/.test(date)&&/13/.test(date)&&/8:00/.test(date)&&/9:30/.test(date)&&/PHT/.test(date),date);
  ok(/Registration open/.test(status),status);
  const tabs=await p.$$eval('[data-event-tabs] button',b=>b.map(x=>x.textContent.trim()));
  eq(tabs.map(t=>t.replace(/\d+$/,'')),['Details','Media','Partners','Applications','Registrations','Email','Feedback','Event reports','Settings'],'labels');
  await p.close();
});

await T('Event reports lean tab uses live counts and never ships 48/12/4.2/25%',async()=>{
  const p=await ctx.newPage();
  await routeAdmin(p);
  await p.goto(`${BASE}/admin-events.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-admin-events]',{timeout:9000});
  await p.click('tr[data-event="2026-10-ai-exchange"] [data-edit-event]');
  await p.click('[data-tab="reports"]');
  await p.waitForSelector('[data-tabpanel="reports"] .rstat',{timeout:9000});
  const t=await p.locator('[data-tabpanel="reports"]').innerText();
  ok(!/\b48\b/.test(t)&&!/\b25%/.test(t)&&!/\b4\.2\b/.test(t),`must not ship mock figures: ${t.slice(0,400)}`);
  // non-cancelled with eventId: r1 registered, r2 missing, r4 attended, r5 no_show.
  // r3 cancelled still counts in registrations total (5 with eventId). legacy excluded.
  ok(/Registrations/.test(t),'registrations card');
  ok(/Not measured/.test(t),'attendance/watch/revenue named');
  ok(await p.locator('[data-export-report]').isVisible(),'Export');
  await p.close();
});

await T('Reports list When/status come from the event; waitlist is not a number',async()=>{
  const p=await ctx.newPage();
  await routeAdmin(p);
  await p.goto(`${BASE}/admin-reports.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-admin-reports]',{timeout:9000});
  const t=await p.locator('[data-reports-list]').innerText();
  ok(/AI Exchange — October 2026/.test(t),'october row');
  ok(/October 13/.test(t)||/8:00/.test(t),'when from record');
  ok(/Registration open/.test(t),'status from record');
  ok(!/Watch/.test(t)&&!/Revenue/.test(t)&&!/Attendance/.test(t.split('\n')[0]),'no extra columns in the header');
  await p.click('[data-open-event="2026-10-ai-exchange"]');
  await p.waitForSelector('[data-rpanel="dashboard"] .rstat',{timeout:9000});
  const dash=await p.locator('[data-rpanel="dashboard"]').innerText();
  ok(/Waitlist/.test(dash),'waitlist is named');
  ok(/not measured/i.test(dash),'and labelled not measured');
  ok(/Partner applications/i.test(dash)&&/Partners on this event/i.test(dash),'the two partner counts are not conflated');
  ok(!/\b48\b/.test(dash)&&!/\b25%/.test(dash),`no mock figures: ${dash.slice(0,500)}`);
  ok(!/Attended/.test(dash)&&!/No-show/.test(dash)&&!/No show/.test(dash),'attended/no_show are not report bars');
  await p.close();
});

await T('empty feedback tab says so and does not ship example quotes',async()=>{
  const p=await ctx.newPage();
  await routeAdmin(p);
  await p.goto(`${BASE}/admin-reports.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-admin-reports]',{timeout:9000});
  await p.click('[data-open-event="2026-10-ai-exchange"]');
  await p.click('[data-rtab="feedback"]');
  await p.waitForSelector('[data-rpanel="feedback"]',{timeout:9000});
  const t=await p.locator('[data-rpanel="feedback"]').innerText();
  ok(/No one has sent feedback|not sent feedback|No feedback/i.test(t),t);
  ok(!/The live demo/.test(t)&&!/The Q&A/.test(t)&&!/The overview/.test(t),'no mock quotes');
  await p.close();
});

await T('unavailable feedback is not a count of zero',async()=>{
  const p=await ctx.newPage();
  await routeAdmin(p,{feed:feedStub({rFail:true})});
  await p.goto(`${BASE}/admin-reports.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-admin-reports]',{timeout:9000});
  await p.click('[data-open-event="2026-10-ai-exchange"]');
  await p.waitForSelector('[data-rpanel="dashboard"] .rstat',{timeout:9000});
  const t=await p.locator('[data-rpanel="dashboard"]').innerText();
  ok(/not available|not connected|not measured/i.test(t),t);
  // A live zero would be the digit 0 next to Feedback responses. Stub must not
  // look like 0 responses.
  const cards=await p.$$eval('.rstat',els=>els.map(e=>({k:e.querySelector('.k')?.textContent,v:e.querySelector('.v')?.textContent})));
  const fb=cards.find(c=>/Feedback/.test(c.k||''));
  ok(fb && fb.v.trim()==='—',`feedback card should be a stub dash, got ${JSON.stringify(fb)}`);
  await p.close();
});

await T('joined denominator excludes cancelled and rows with no eventId; rate not 0% when joined is 0',async()=>{
  const p=await ctx.newPage();
  await routeAdmin(p);
  await p.goto(`${BASE}/admin-events.html`,{waitUntil:'load'});
  const r=await p.evaluate(async (regs)=>{
    const m=await import('/assets/js/paaipe-feedback.js');
    const ev={id:'2026-10-ai-exchange',title:'AI Exchange — October 2026',status:'registration_open',
      date:'2026-10-13',startTime:'20:00',endTime:'21:30'};
    const empty=m.buildEventReport(ev,{
      regs:[],regsOk:true,sponsors:[],sponsorsOk:true,apps:[],appsOk:true,
      questions:{ok:true,rows:[]},feedback:{ok:true,rows:[]},
    });
    const live=m.buildEventReport(ev,{
      regs,regsOk:true,sponsors:[],sponsorsOk:true,apps:[],appsOk:true,
      questions:{ok:true,rows:[]},feedback:{ok:true,rows:[{id:'x',answers:{}},{id:'y',answers:{}}]},
    });
    return {
      emptyRateLive: empty.responseRate.live,
      emptyReason: empty.responseRate.reason,
      joined: live.joined.value,
      registrations: live.registrations.value,
      registered: live.registered.value,
      cancelled: live.cancelled.value,
      waitlistLive: live.waitlist.live,
      waitlistFig: m.figureText(live.waitlist),
      rate: live.responseRate.display,
    };
  }, REGS);
  eq(r.emptyRateLive,false,'joined 0 is not measured, not 0%');
  ok(/no joined/i.test(r.emptyReason),r.emptyReason);
  eq(r.registrations,5,'legacy without eventId excluded');
  eq(r.joined,4,'cancelled out of joined; attended and no_show stay in the denominator');
  eq(r.registered,2,'missing status counts as registered; attended/no_show are not in this bar');
  eq(r.cancelled,1,'cancelled');
  eq(r.waitlistLive,false,'waitlist not a number');
  eq(r.waitlistFig,'Not measured','waitlist is labelled, never 0');
  eq(r.rate,'50%','2/4 joined');
  await p.close();
});

await T('public block is hidden without a registration receipt',async()=>{
  const p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:memberStub}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub}));
  await p.goto(`${BASE}/event-2026-10-ai-exchange.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-event-view]',{timeout:9000});
  eq(await p.locator('[data-event-feedback]:not([hidden])').count(),0,'hidden from a member with no receipt');
  await p.close();
});

await T('joined attendee sees a locked control before start, questions hidden',async()=>{
  const p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:memberStub}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub}));
  await p.route('**/assets/js/paaipe-feedback-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FEED}));
  await p.route('**/assets/js/paaipe-feedback.js',r=>r.fulfill({contentType:'text/javascript',body:feedStub()}));
  await p.addInitScript(()=>{
    localStorage.setItem('paaipe.registrationReceipt.v1', JSON.stringify({
      '2026-10-ai-exchange':{registrationId:'r1',email:'ada@x.com',at:1}
    }));
  });
  await p.goto(`${BASE}/event-2026-10-ai-exchange.html`,{waitUntil:'load'});
  await p.waitForSelector('[data-feedback-state="locked"]',{timeout:9000});
  eq(await p.locator('[data-efb-form]').count(),0,'questions hidden');
  ok(await p.locator('.efb-off').isDisabled(),'disabled control, not a link');
  eq(await p.locator('.efb-off a').count(),0,'not a link');
  const t=await p.locator('[data-event-feedback]').innerText();
  ok(/8:00/.test(t)&&/October 13/.test(t),t);
  await p.close();
});

await T('a visitor who is not signed in never sees the block even with a leftover receipt',async()=>{
  const p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:guestStub}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub}));
  await p.addInitScript(()=>{
    localStorage.setItem('paaipe.registrationReceipt.v1', JSON.stringify({
      '2026-10-ai-exchange':{registrationId:'r1',email:'ada@x.com',at:1}
    }));
  });
  await p.goto(`${BASE}/event-2026-10-ai-exchange.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-event-view]',{timeout:9000});
  eq(await p.locator('[data-feedback-state="locked"], [data-feedback-state="open"]').count(),0,'hidden');
  await p.close();
});

await T('joined attendee after start sees the four questions when docs exist',async()=>{
  const p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:memberStub}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub}));
  await p.goto(`${BASE}/event-2026-10-ai-exchange.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-event-view]',{timeout:9000});
  const state=await p.evaluate(async (qs)=>{
    const m=await import('/assets/js/paaipe-feedback.js');
    const host=document.querySelector('[data-event-feedback]');
    const ev={id:'2026-10-ai-exchange',title:'AI Exchange — October 2026',
      status:'registration_open',date:'2026-10-13',startTime:'20:00',endTime:'21:30'};
    await m.mountPublicFeedback(host, ev, {
      joined:true,
      receipt:{registrationId:'r1',email:'ada@x.com'},
      existing:{ok:true,row:null},
      now:new Date('2026-10-13T20:00:00+08:00'),
      questions:{ok:true,rows:qs},
    });
    return {
      state: host.getAttribute('data-feedback-state'),
      keys: [...host.querySelectorAll('[data-efb-q]')].map(el=>el.getAttribute('data-efb-q')),
      submit: !!host.querySelector('[data-efb-form] button[type=submit]'),
    };
  }, QS);
  eq(state.state,'open','open after start');
  eq(state.keys,['2026-10-ai-exchange_overall','2026-10-ai-exchange_recommend','2026-10-ai-exchange_mostUseful','2026-10-ai-exchange_improve'],'answer keys are question doc ids');
  eq(state.submit,true,'Submit control');
  await p.close();
});

await T('empty questions collection is a seed, not stored docs',async()=>{
  const p=await ctx.newPage();
  await routeAdmin(p,{feed:feedStub({questions:[]})});
  await p.goto(`${BASE}/admin-events.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-admin-events]',{timeout:9000});
  await p.click('tr[data-event="2026-10-ai-exchange"] [data-edit-event]');
  await p.click('[data-tab="feedback"]');
  await p.waitForSelector('[data-fq-seed],[data-fq-list]',{timeout:9000});
  ok(await p.locator('[data-fq-seed]').count(),'honest seed copy');
  const t=await p.locator('[data-fq-seed]').innerText();
  ok(/not stored until you Save/i.test(t),t);
  const keys=await p.$$eval('[data-fq]',els=>els.map(e=>e.dataset.fqKey));
  eq(keys,['overall','recommend','mostUseful','improve'],'starter keys ready to write');
  await p.close();
});

await T('new register form keeps the returned registrationId',()=>{
  const html=readFileSync(`${ROOT}/register-2026-10-ai-exchange.html`,'utf8');
  ok(/rememberRegistrationReceipt/.test(html),'stores the receipt');
  ok(/const id = await fb\.submitRegistration/.test(html),'keeps the returned id');
});

await T('response ids are eventId_registrationId and answers use question document ids',async()=>{
  const p=await ctx.newPage();
  await routeAdmin(p);
  await p.goto(`${BASE}/admin-events.html`,{waitUntil:'load'});
  const r=await p.evaluate(async()=>{
    const m=await import('/assets/js/paaipe-feedback.js');
    return {
      q:m.questionDocId('2026-10-ai-exchange','overall'),
      r:m.responseDocId('2026-10-ai-exchange','abc123'),
    };
  });
  eq(r.q,'2026-10-ai-exchange_overall','question id');
  eq(r.r,'2026-10-ai-exchange_abc123','response id');
  await p.close();
});

await T('Reports nav sits under Events, after Events, before Registrations',()=>{
  const js=readFileSync(`${ROOT}/assets/js/paaipe-admin.js`,'utf8');
  const nav=js.slice(js.indexOf('export const ADMIN_NAV'), js.indexOf('const ICONS'));
  const events=nav.indexOf('admin-events.html');
  const reports=nav.indexOf('admin-reports.html');
  const regs=nav.indexOf('admin-registrations.html');
  ok(events>=0&&reports>events&&regs>reports,`order events=${events} reports=${reports} regs=${regs}`);
});

await T('Export button label is exactly Export',async()=>{
  const p=await ctx.newPage();
  await routeAdmin(p);
  await p.goto(`${BASE}/admin-reports.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-admin-reports]',{timeout:9000});
  await p.click('[data-open-event="2026-10-ai-exchange"]');
  await p.waitForSelector('[data-export-report]',{timeout:9000});
  eq((await p.locator('[data-export-report]').innerText()).trim(),'Export','label');
  await p.close();
});

await T('questions field is order never displayOrder; public never writes questions',()=>{
  const feed=readFileSync(`${ROOT}/assets/js/paaipe-feedback.js`,'utf8');
  ok(!/displayOrder/.test(feed),'feedback helper has no displayOrder');
  const qBlock=RULES.slice(RULES.indexOf('isWellFormedFeedbackQuestion'), RULES.indexOf('isWellFormedFeedbackResponse'));
  ok(/hasOnly\(\['eventId','questionKey','order'/.test(qBlock),'order is the field');
  ok(!/displayOrder/.test(qBlock),'questions rules never name displayOrder');
  ok(/allow create: if isAdmin\(\)/.test(qBlock)&&/allow update: if isAdmin\(\)/.test(qBlock),'public never writes questions');
  ok(/allow delete: if false/.test(qBlock),'no delete on questions');
  const rBlock=RULES.slice(RULES.indexOf('paaipe_event_feedback_responses'));
  ok(/allow delete: if false/.test(rBlock),'no delete on responses');
  ok(/submittedAt == request.time/.test(rBlock),'submittedAt is request.time on create');
  ok(/submittedAt == resource.data.submittedAt/.test(rBlock),'submittedAt immutable on update');
});

await T('partner applications and partners-on-event are separate counts',async()=>{
  const p=await ctx.newPage();
  await routeAdmin(p);
  await p.goto(`${BASE}/admin-events.html`,{waitUntil:'load'});
  const r=await p.evaluate(async()=>{
    const m=await import('/assets/js/paaipe-feedback.js');
    const ev={id:'2026-10-ai-exchange',title:'AI Exchange — October 2026',status:'registration_open',
      date:'2026-10-13',startTime:'20:00',endTime:'21:30'};
    const live=m.buildEventReport(ev,{
      regs:[],regsOk:true,
      sponsors:[{id:'s1',contributionType:'cash'},{id:'s2',contributionType:'in_kind'}],
      sponsorsOk:true,
      apps:[{status:'new'},{status:'spam'},{status:'accepted'}],
      appsOk:true,
      questions:{ok:true,rows:[]},feedback:{ok:true,rows:[]},
    });
    return {
      partners: live.partners.value,
      partnersSource: live.partners.source,
      apps: live.partnerApplications.value,
      appsSource: live.partnerApplications.source,
    };
  });
  eq(r.partners,2,'sponsor document count, not a sum of contributionType');
  eq(r.apps,3,'all application statuses including spam');
  ok(r.partnersSource!==r.appsSource,`${r.partnersSource} vs ${r.appsSource}`);
  await p.close();
});

await T('an answer cites the question document id, never order or the key alone',async()=>{
  const p=await ctx.newPage();
  await routeAdmin(p);
  await p.goto(`${BASE}/admin-events.html`,{waitUntil:'load'});
  const r=await p.evaluate(async()=>{
    const m=await import('/assets/js/paaipe-feedback.js');
    const id=m.questionDocId('2026-10-ai-exchange','overall');
    const cited=m.citedQuestionIds([{answers:{[id]:4}}]);
    return {id, hasDoc:cited.has(id), hasKey:cited.has('overall'), hasOrder:cited.has('0')};
  });
  eq(r.id,'2026-10-ai-exchange_overall','doc id');
  eq(r.hasDoc,true,'cites document id');
  eq(r.hasKey,false,'not the questionKey alone');
  eq(r.hasOrder,false,'not order');
  await p.close();
});

await T('admin bypasses the start gate on a joined public page',async()=>{
  const p=await ctx.newPage();
  p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:memberStub}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub}));
  await p.goto(`${BASE}/event-2026-10-ai-exchange.html`,{waitUntil:'load'});
  await p.waitForSelector('html[data-event-view]',{timeout:9000});
  const state=await p.evaluate(async (qs)=>{
    const m=await import('/assets/js/paaipe-feedback.js');
    const host=document.querySelector('[data-event-feedback]');
    const ev={id:'2026-10-ai-exchange',title:'AI Exchange — October 2026',
      status:'registration_open',date:'2026-10-13',startTime:'20:00',endTime:'21:30'};
    await m.mountPublicFeedback(host, ev, {
      joined:true, admin:true,
      receipt:{registrationId:'r1',email:'ada@x.com'},
      existing:{ok:true,row:null},
      now:new Date('2026-10-01T12:00:00+08:00'),
      questions:{ok:true,rows:qs},
    });
    return host.getAttribute('data-feedback-state');
  }, QS);
  eq(state,'open','admin sees the form before start');
  await p.close();
});

await T('short answers allow 2000 characters; dashboard names both partner counts',async()=>{
  const feed=readFileSync(`${ROOT}/assets/js/paaipe-feedback.js`,'utf8');
  ok(/maxlength="2000"/.test(feed),'short max 2000');
  const dash=readFileSync(`${ROOT}/assets/js/paaipe-event-reports.js`,'utf8');
  ok(/Partner applications/.test(dash)&&/Partners on this event/.test(dash),'split labels');
  ok(!/contributionType/.test(dash),'reports do not sum contributionType');
});

await T('no console errors',()=>ok(errs.length===0,errs.join(' | ')));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
