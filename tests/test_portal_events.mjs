/* Portal Events: Register and Add to calendar must be real destinations.
 *
 * They shipped as href="#", which is why the live URL ends portal-events#.
 * Calendar files and event/register pages already exist; this suite refuses
 * a row whose button does not point at one of those files.
 */
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'fs';
const BASE=process.env.PAAIPE_BASE||'http://127.0.0.1:8899', ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
const REAL_FB=readFileSync(`${ROOT}/assets/js/paaipe-firebase.js`,'utf8');
let pass=0,fail=0;
const T=async(n,f)=>{try{await f();console.log(`  PASS  ${n}`);pass++}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++}};
const ok=(c,m)=>{if(!c)throw new Error(m)};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)};

const html=readFileSync(`${ROOT}/portal-events.html`,'utf8');
const fileOf=href=>href.replace(/^\//,'').split(/[?#]/)[0];

function actsOf(month){
  const re=new RegExp(`<div class="row">[\\s\\S]*?<b>${month}</b>[\\s\\S]*?<div class="acts">([\\s\\S]*?)</div></div>`);
  const m=html.match(re);
  if(!m) throw new Error(`no ${month} row`);
  return m[1];
}
function hrefs(chunk, label){
  const out=[];
  const re=new RegExp(`<a class="btn[^"]*"[^>]*href="([^"]+)"[^>]*>\\s*${label}\\s*</a>`,'g');
  let m; while((m=re.exec(chunk))) out.push(m[1]);
  return out;
}

await T('Register and Add to calendar are not href="#"',async()=>{
  const dead=/<a class="btn[^"]*"[^>]*href="#"[^>]*>\s*(Register|Add to calendar)\s*<\/a>/;
  ok(!dead.test(html),'those two controls must not be hash stubs');
});

await T('November and December Register point at an existing event or register page',async()=>{
  for(const month of ['NOV','DEC']){
    const hs=hrefs(actsOf(month),'Register');
    eq(hs.length,1,`${month} Register count`);
    ok(!/^#/.test(hs[0]),`${month} Register must not be #`);
    const f=fileOf(hs[0]);
    ok(existsSync(`${ROOT}/${f}`),`${month} Register target missing: ${f}`);
    ok(/^(event|register)-2026-(11|12)-ai-exchange\.html$/.test(f),
      `${month} Register should be that event's page or form, got ${f}`);
  }
});

await T('October has no Register (already registered) and every row has a real .ics',async()=>{
  eq(hrefs(actsOf('OCT'),'Register').length,0,'October must not offer Register');
  for(const month of ['OCT','NOV','DEC']){
    const hs=hrefs(actsOf(month),'Add to calendar');
    eq(hs.length,1,`${month} calendar count`);
    ok(hs[0].endsWith('.ics'),`${month} calendar should be an .ics, got ${hs[0]}`);
    ok(existsSync(`${ROOT}/${fileOf(hs[0])}`),`${month} calendar file missing: ${hs[0]}`);
  }
});

const fbStub=`export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return {uid:'u1',email:'agent@example.com',full_name:'Test Agent',status:'agent'}}
  export async function isAdminNow(){return false}
  export async function signOutNow(){}`;

const br=await chromium.launch();
const ctx=await br.newContext({acceptDownloads:true,viewport:{width:1280,height:900}});
async function openPortal(){
  const p=await ctx.newPage();
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub}));
  await p.goto(`${BASE}/portal-events.html`,{waitUntil:'load'});
  await p.waitForSelector('.row .acts',{timeout:9000});
  return p;
}

await T('clicking November Register leaves the hash stub and opens that event',async()=>{
  const p=await openPortal();
  const a=p.locator('.row',{hasText:'November 2026'}).locator('a',{hasText:'Register'});
  ok(await a.count(),'November Register is on the page');
  const href=await a.getAttribute('href');
  ok(href && href!=='#',`href was ${href}`);
  await Promise.all([p.waitForURL(/event-2026-11-ai-exchange/,{timeout:9000}), a.click()]);
  ok(/event-2026-11-ai-exchange/.test(p.url()),`landed on ${p.url()}`);
  ok(await p.locator('[data-register-cta]').count(),'event page hosts the real registration CTA');
  await p.close();
});

await T('clicking Add to calendar downloads that event\'s .ics',async()=>{
  const p=await openPortal();
  const a=p.locator('.row',{hasText:'November 2026'}).locator('a',{hasText:'Add to calendar'});
  const [dl]=await Promise.all([p.waitForEvent('download',{timeout:9000}), a.click()]);
  ok(/2026-11-ai-exchange\.ics$/.test(dl.suggestedFilename()),`got ${dl.suggestedFilename()}`);
  const body=readFileSync(await dl.path(),'utf8');
  ok(/BEGIN:VEVENT/.test(body),'a calendar event, not an empty file');
  ok(/November 2026/.test(body),'the November session');
  await p.close();
});

await br.close();
console.log(`==== ${pass} passed, ${fail} failed ====`);
process.exit(fail?1:0);
