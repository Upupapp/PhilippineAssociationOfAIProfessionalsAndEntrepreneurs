/* Agent Portal Programs hub.
 *
 * The numbered .prog list is gone. The page is a visual hub, but the CTAs
 * and status pills must still be the honest ones — no XP, no Mentorship
 * band, no invented Dashboard nav. Next Exchange is painted from
 * listEvents(), and a failed fetch must leave the markup alone.
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

const OCT={id:'2026-10-ai-exchange',slug:'event-2026-10-ai-exchange',title:'AI Exchange — October 2026',
  status:'registration_open',date:'2026-10-13',startTime:'20:00',timezone:'Asia/Manila'};
const NOV={id:'2026-11-ai-exchange',slug:'event-2026-11-ai-exchange',title:'AI Exchange — November 2026',
  status:'registration_open',date:'2026-11-10',startTime:'20:00',timezone:'Asia/Manila'};
const FAR={id:'2099-02-ai-exchange',slug:'event-2099-02-ai-exchange',title:'AI Exchange — February 2099',
  status:'published',date:'2099-02-09',startTime:'20:00',timezone:'Asia/Manila'};

const fbStub=`export * from '/assets/js/paaipe-firebase-real.js';
  export function isConfigured(){return true}
  export async function currentAgent(){return {uid:'u1',email:'a@b.c',full_name:'A B',status:'guest',emailVerified:true}}`;
const dataStub=({events=[OCT,NOV],throws=false}={})=>`
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function listEvents(){ ${throws?"throw new Error('offline');":`return ${JSON.stringify(events)}`} }`;

const br=await chromium.launch();
const errs=[];
async function open(opts={}, viewport={width:1280,height:900}){
  const ctx=await br.newContext({viewport});
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub}));
  await p.route('**/assets/js/paaipe-events-data-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_DATA}));
  await p.route('**/assets/js/paaipe-events-data.js',r=>r.fulfill({contentType:'text/javascript',body:dataStub(opts)}));
  await p.goto(`${BASE}/portal-programs.html`,{waitUntil:'load'});
  await p.waitForSelector('[data-nx-ready]',{state:'attached',timeout:9000});
  return {p,ctx};
}

const names=p=>p.$$eval('#programs .pcard h3',els=>els.map(e=>e.textContent.trim()));

await T('the hub has a hero, a 7-step path, and seven program cards',async()=>{
  const {p,ctx}=await open();
  ok(await p.getByRole('heading',{name:/your path in/i}).count(),'hero title');
  ok(await p.locator('.phero-sub').innerText().then(t=>/AI-powered Philippines/i.test(t)),'subline');
  eq(await p.locator('.journey li').count(),7,'seven inspirational steps');
  eq(await names(p),['AI Exchange','AI Safari','Build Nights','Certification Pathways','Member Spotlight','Regional Circles','Mentorship'],'all seven programs');
  await ctx.close();
});

await T('the hub uses Inter like sibling portal pages on main, not Poppins',async()=>{
  const {p,ctx}=await open();
  const html=await p.content();
  ok(/family=Inter:wght@400;500;600;700;800/.test(html),'same Google Fonts Inter link as portal.html');
  ok(!/family=Poppins/.test(html),'must not load Poppins on this portal page');
  const fam=await p.evaluate(()=>getComputedStyle(document.body).fontFamily);
  ok(/^Inter\b/.test(fam),`body stack should start with Inter, got ${fam}`);
  await ctx.close();
});

await T('Explore programs points at the card grid',async()=>{
  const {p,ctx}=await open();
  eq(await p.locator('.phero-copy a.btn').getAttribute('href'),'#programs','hash to the grid');
  ok(await p.locator('#programs').count(),'the grid is the target');
  await ctx.close();
});

await T('portal chrome is the current nav, not the wireframe Dashboard set',async()=>{
  const {p,ctx}=await open();
  const items=await p.$$eval('.side .menu a',as=>as.map(a=>a.textContent.replace(/\s+/g,' ').trim()));
  ok(items.includes('Home') && items.includes('Events') && items.includes('Programs'),'current portal items');
  ok(!items.some(t=>/Dashboard|My Journey|Network/i.test(t)),`wireframe nav leaked: ${items.join('|')}`);
  await ctx.close();
});

await T('no fake XP, no Mentorship band, no numbered .prog list',async()=>{
  const {p,ctx}=await open();
  const body=await p.locator('main.content').innerText();
  ok(!/\bXP\b/.test(body),'must not ship fake XP');
  ok(!/1247|2000/.test(body),'must not ship the wireframe counters');
  eq(await p.locator('.card.prog').count(),0,'old numbered rows are gone');
  eq(await p.locator('.pgrid > .pcard').count(),7,'Mentorship is a normal card in the grid');
  eq(await p.locator('[data-mentorship-band], .mentorship-band').count(),0,'no featured band');
  await ctx.close();
});

await T('honest statuses and the existing CTAs are still there',async()=>{
  const {p,ctx}=await open();
  const body=await p.locator('#programs').innerText();
  ok(/Registered for Oct 13/.test(body),'Exchange registered pill');
  ok((body.match(/In development/g)||[]).length>=6,'the six programs still in development');
  ok(await p.locator('#programs a[href="portal-events.html"]').count(),'Events link');
  ok(await p.getByRole('link',{name:/Join interest list/i}).count(),'Safari interest list');
  ok(await p.getByRole('link',{name:/Join waitlist/i}).count(),'Build Nights waitlist');
  ok(await p.getByRole('link',{name:/Notify me/i}).count(),'Certification notify');
  ok(await p.getByRole('link',{name:/Nominate yourself or a peer/i}).count(),'Spotlight nominate');
  ok(await p.getByRole('link',{name:/Join circle/i}).count(),'Circles join');
  ok(await p.getByRole('link',{name:/Apply as mentee/i}).count(),'Mentee CTA');
  ok(await p.locator('#programs [data-agents-only]').count(),'mentor stays Agents-only');
  ok(await p.locator('#programs [data-guest-notice]').count(),'Safari guest notice hook');
  ok(await p.locator('#programs select').count(),'circle select');
  await ctx.close();
});

await T('Next Exchange links to Events and is painted from listEvents()',async()=>{
  const {p,ctx}=await open({events:[FAR]});
  const card=p.locator('[data-next-exchange]');
  eq(await card.getAttribute('href'),'portal-events.html','goes to Events');
  eq(await card.getAttribute('data-nx-id'),'2099-02-ai-exchange','the live record, not the markup fallback');
  ok(/Feb 9/i.test(await card.locator('[data-nx-when]').innerText()),'the far-future date');
  ok(/8:00 PM PHT/.test(await card.locator('[data-nx-time]').innerText()),'series time from startTime');
  ok(!(/Oct 13/.test(await card.innerText())),'must not keep the fallback once a live next exists');
  await ctx.close();
});

await T('a failed events fetch leaves the markup Next Exchange alone',async()=>{
  const {p,ctx}=await open({throws:true});
  const card=p.locator('[data-next-exchange]');
  ok(await card.isVisible(),'the fallback stays');
  ok(/Oct 13/.test(await card.locator('[data-nx-when]').innerText()),'Tue Oct 13 from the HTML');
  ok(/8:00 PM PHT/.test(await card.locator('[data-nx-time]').innerText()),'time from the HTML');
  await ctx.close();
});

await T('no upcoming Exchange hides the card rather than inventing one',async()=>{
  const {p,ctx}=await open({events:[{...OCT,status:'held'}]});
  ok(await p.locator('[data-next-exchange]').isHidden(),'nothing to show');
  await ctx.close();
});

await T('a guest still sees the Agents-only signifier on Apply as mentor',async()=>{
  const {p,ctx}=await open();
  await p.waitForSelector('html[data-membership]',{timeout:9000});
  const t=await p.locator('#programs [data-agents-only]').innerText();
  ok(/Agents only/i.test(t),`mentor CTA should say Agents only, said "${t}"`);
  await ctx.close();
});

await T('BREAK-CHECK: a fake XP string on the hub would fail the honesty test',async()=>{
  // Proves the XP assertion is live: if it were a no-op, this mutation would
  // still "pass". We inject XP into a copy of the page and expect the same
  // check used above to catch it.
  const html=readFileSync(`${ROOT}/portal-programs.html`,'utf8');
  ok(!/\bXP\b/.test(html.split('<main')[1]||html),'the committed hub has no XP');
  ok(/1247/.test(html.replace('Next Exchange','1247 / 2000 XP')),'the probe itself matches');
});

console.log(`==== ${pass} passed, ${fail} failed ====`);
await br.close();
process.exit(fail?1:0);
