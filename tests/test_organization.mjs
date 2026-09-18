/* My Organization — portal list, empty state, add/edit, pills, apply picker. */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const BASE=process.env.PAAIPE_BASE||'http://127.0.0.1:8899', ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
const REAL_FB=readFileSync(`${ROOT}/assets/js/paaipe-firebase.js`,'utf8');
const REAL_DATA=readFileSync(`${ROOT}/assets/js/paaipe-events-data.js`,'utf8');
const RULES=readFileSync(`${ROOT}/firestore.rules`,'utf8');
let pass=0,fail=0;
const T=async(n,f)=>{try{await f();console.log(`  PASS  ${n}`);pass++}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++}};
const ok=(c,m)=>{if(!c)throw new Error(m)};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)};

const EVENTS=[
  {id:'2026-10-ai-exchange',title:'AI Exchange — October 2026',status:'registration_open'},
  {id:'2026-11-ai-exchange',title:'AI Exchange — November 2026',status:'published'},
];
const fbStub=({signedIn=true,status='agent',email='rosa@example.com',name='Rosa Villanueva'}={})=>`
  export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return ${signedIn}?{
    uid:'u1', email:'${email}', full_name:'${name}', status:'${status}',
    isAgent:${status==='agent'}, emailVerified:true, directoryVisible:false,
    agentNumber:${status==='agent'?'"0006"':'null'}, confirmationSeen:true
  }:null}`;

const dataStub=({orgs=[],apps=[],events=EVENTS,failSave=null}={})=>`
  export * from '/assets/js/paaipe-events-data-real.js';
  window.__orgWrites=[];
  window.__partnerWrites=[];
  export async function listMyOrganizations(){ return ${JSON.stringify(orgs)} }
  export async function listOrganizations(){ return ${JSON.stringify(orgs.filter(o=>o.status==='active'))} }
  export async function listEvents(){ return ${JSON.stringify(events)} }
  export async function myApplications(){
    const m=new Map();
    for(const a of ${JSON.stringify(apps)}) m.set(a.eventId||a.id,a);
    return m;
  }
  export async function saveMyOrganization(fields){
    window.__orgWrites.push(fields);
    ${failSave?`throw Object.assign(new Error('nope'),{code:'${failSave}'});`:''}
    return { id: fields.id||'new-org', name: fields.name, website: fields.website||'',
             status:'inactive', createdByUserId:'u1' };
  }
  export async function submitPartnerApplication(fields){
    window.__partnerWrites.push(fields);
    return { id:'a1', reference:'PA-2026-ABCD' };
  }`;

const br=await chromium.launch();
const errs=[];
async function open(opts={}){
  const ctx=await br.newContext({viewport:{width:1280,height:900}});
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub(opts.fb||{})}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub(opts.data||{})}));
  await p.goto(`${BASE}/${opts.page||'portal-organization.html'}`,{waitUntil:'load'});
  const page=opts.page||'portal-organization.html';
  if(page==='portal-organization.html')
    await p.waitForSelector('html[data-org-ready]',{timeout:9000});
  else
    await p.waitForSelector('.side .menu',{timeout:9000});
  return {p,ctx};
}

const EMPTY_HEAD='No organization yet.';
const EMPTY_BTN='Add an organization.';
const EMPTY_SUB='Add the company you speak for, then use it when you apply as a Partner. It stays unpublished until PAAIPE confirms the partnership.';
const NOTE='This is not public until PAAIPE confirms you as a Partner.';

await T('nav: My Organization sits under YOU, immediately after My Profile',async()=>{
  const {p,ctx}=await open({page:'portal.html',fb:{signedIn:true}});
  const labels=await p.$$eval('.side .menu a, .side .menu .sec',els=>els.map(e=>e.textContent.trim()));
  const you=labels.indexOf('YOU');
  ok(you>=0,`YOU section present: ${labels.join(' | ')}`);
  eq(labels[you+1],'My Profile','My Profile first under YOU');
  eq(labels[you+2],'My Organization','My Organization immediately after');
  await ctx.close();
});

await T('empty state copy is locked',async()=>{
  const {p,ctx}=await open();
  eq(await p.getAttribute('html','data-org-view'),'empty','empty view');
  const t=await p.locator('[data-org-empty]').innerText();
  ok(t.includes(EMPTY_HEAD),`heading: ${t}`);
  ok(t.includes(EMPTY_SUB),`subcopy: ${t}`);
  eq((await p.locator('[data-org-add]').innerText()).trim(),EMPTY_BTN,'button');
  await ctx.close();
});

await T('Add / Edit fields are only Name and Website, with the locked note and gold Save',async()=>{
  const {p,ctx}=await open();
  await p.locator('[data-org-add]').click();
  eq(await p.getAttribute('html','data-org-view'),'editor','editor');
  eq(await p.locator('[data-org-form] input').count(),2,'only two fields');
  ok(await p.locator('#org-name').count(),'Name');
  ok(await p.locator('#org-web').count(),'Website');
  const note=await p.locator('.org-note').innerText();
  eq(note.trim(),NOTE,'the unpublished note');
  const save=p.locator('[data-org-save]');
  eq((await save.innerText()).trim(),'Save','Save');
  ok(await save.evaluate(el=>el.classList.contains('btn-gold')),'gold');
  eq(await p.locator('[data-org-form] select').count(),0,'user cannot set the pill');
  eq(await p.locator('text=Delete').count(),0,'no delete in v1');
  await ctx.close();
});

await T('Guest and Agent see the same editor',async()=>{
  for(const status of ['guest','agent']){
    const {p,ctx}=await open({fb:{status}});
    await p.locator('[data-org-add]').click();
    eq(await p.locator('[data-org-form] input').count(),2,status);
    eq((await p.locator('.org-note').innerText()).trim(),NOTE,status+' note');
    await ctx.close();
  }
});

await T('saving a new org writes name and website, unpublished',async()=>{
  const {p,ctx}=await open();
  await p.locator('[data-org-add]').click();
  await p.fill('#org-name','Northwind Analytics');
  await p.fill('#org-web','northwind.example.com');
  await p.locator('[data-org-save]').click();
  await p.waitForFunction(()=>window.__orgWrites.length===1,{timeout:5000});
  const w=await p.evaluate(()=>window.__orgWrites[0]);
  eq(w.name,'Northwind Analytics','name');
  eq(w.website,'northwind.example.com','website');
  ok(!w.status,'client does not set the pill');
  await ctx.close();
});

await T('one list for many orgs: stacked cards, no switcher, pills from data',async()=>{
  const orgs=[
    {id:'a',name:'Northwind Analytics',website:'https://northwind.example.com',status:'inactive'},
    {id:'b',name:'Contoso',status:'inactive'},
    {id:'c',name:'GetHired Online',website:'https://gethired.ph',status:'active'},
  ];
  const apps=[{id:'x',eventId:'2026-10-ai-exchange',organizationId:'b',companyName:'Contoso',status:'new'}];
  const {p,ctx}=await open({data:{orgs,apps}});
  eq(await p.getAttribute('html','data-org-view'),'list','list view');
  eq(await p.locator('[data-org-card]').count(),3,'all three, none hidden');
  eq(await p.locator('[data-org-card][data-org-pill="unpublished"]').count(),1,'Not published');
  eq(await p.locator('[data-org-card][data-org-pill="review"]').count(),1,'Under review');
  eq(await p.locator('[data-org-card][data-org-pill="partner"]').count(),1,'Partner');
  const labels=await p.$$eval('[data-org-card] .pill',els=>els.map(e=>e.textContent.trim()));
  eq(labels,['Not published','Under review','Partner'],'only these pills');
  eq(await p.locator('[data-org-id="a"] [data-org-apply]').count(),1,
     'Apply as Partner on unpublished');
  eq(await p.locator('[data-org-id="c"] [data-org-apply]').count(),0,
     'confirmed Partner does not get Apply as Partner');
  eq(await p.locator('[data-org-id="a"] [data-org-edit]').count(),1,'Edit');
  eq(await p.locator('text=Delete').count(),0,'no delete');
  await ctx.close();
});

await T('Apply as Partner opens the existing apply dialog, picker already on that org',async()=>{
  const orgs=[{id:'a',name:'Northwind Analytics',website:'https://northwind.example.com',status:'inactive'}];
  const {p,ctx}=await open({data:{orgs,events:[EVENTS[0]]}});
  await p.locator('[data-org-apply]').click();
  await p.waitForSelector('[data-partner-dialog]',{timeout:5000});
  const d=p.locator('[data-partner-dialog]');
  ok(await d.locator('[name="contactName"]').count(),'name field kept');
  ok(await d.locator('[name="email"]').count(),'email kept');
  ok(await d.locator('[name="phone"]').count(),'phone kept');
  ok(await d.locator('[name="website"]').count(),'website kept');
  ok(await d.locator('[name="supportTypes"]').count(),'support kept');
  ok(await d.locator('[name="message"]').count(),'message kept');
  ok(await d.locator('[name="consent"]').count(),'consent kept');
  eq(await d.locator('[name="companyPick"]').inputValue(),'a','that org is selected');
  eq(await d.locator('[data-company-typed]').isVisible(),false,
     'typed company field is hidden while an own org is picked');
  await ctx.close();
});

await T('My Profile company line stays a personal line, not this list',async()=>{
  const {p,ctx}=await open({page:'portal-profile.html'});
  await p.waitForSelector('[data-agent-ready], [data-agent-field="full_name"]',{timeout:9000});
  const box=p.locator('.f:has(label:text("Company or organization")) input');
  ok(await box.count(),'the personal line is still there');
  const el=box.first();
  ok(!(await el.getAttribute('data-org-id')),'not bound to an org id');
  ok(!(await el.getAttribute('data-agent-field')) || (await el.getAttribute('data-agent-field'))!=='organization',
     'not a live org field');
  await ctx.close();
});

await T('visible UI says Partner, never Sponsor',()=>{
  const html=readFileSync(`${ROOT}/portal-organization.html`,'utf8');
  const js=readFileSync(`${ROOT}/assets/js/paaipe-organization.js`,'utf8');
  ok(!/Sponsor/.test(html+js),'no Sponsor wording on the signed screen');
  ok(/My Organization/.test(html),'nav label');
});

await T('pills are derived, Partner is the only public state in the rules',()=>{
  ok(/resource\.data\.status == 'active'/.test(RULES),'public read is active only');
  const create=RULES.slice(RULES.indexOf('function isWellFormedMemberOrgCreate'));
  ok(/d\.status == 'inactive'/.test(create),'member create is unpublished');
  ok(/canClaimOrganization/.test(RULES),'apply may only claim own or confirmed');
  ok(/portal_organization/.test(RULES),'apply from this screen is an allowed source');
});

await T('no console errors',()=>ok(errs.length===0,errs.join(' | ')));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
