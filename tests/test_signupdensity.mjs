/* Signup form-panel density: Paul's signed type scale + Ericson's locked
 * spacing, so Sign in and the legal line sit inside an 840px-tall column.
 * Brand panel (wordmark indent + two-line headline) must stay untouched. */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const BASE=process.env.PAAIPE_BASE||'http://127.0.0.1:8899', ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
let pass=0,fail=0;
const T=async(n,f)=>{try{await f();console.log(`  PASS  ${n}`);pass++}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++}};
const ok=(c,m)=>{if(!c)throw new Error(m)};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)};

const html=readFileSync(`${ROOT}/signup.html`,'utf8');
const formCss=html.split('/* form panel')[1].split('/* congratulations modal */')[0];
const brandCss=html.split('/* brand panel */')[1].split('/* form panel')[0];

await T('public signup stays Poppins; form panel only in the density edit',()=>{
  ok(!/Inter/.test(html),'public signup stays Poppins');
  ok(/family=Poppins/.test(html),'Poppins loaded');
  ok(/font-family:Poppins/.test(formCss),'form stays Poppins');
});

await T('locked type scale is on the form panel',()=>{
  ok(/\.form h2\{font-size:22px\}/.test(formCss),'headline 22');
  ok(/\.form \.sub\{[^}]*font-size:13px/.test(formCss),'sub 13');
  ok(/label\{font-size:11px/.test(formCss),'labels 11');
  ok(/height:36px/.test(formCss)&&/font-size:13px/.test(formCss),'inputs 13/36');
  ok(/\.check\{[^}]*font-size:12px/.test(formCss),'checks 12');
  ok(/\.form \.btn\{[^}]*min-height:40px[^}]*font-size:13px/.test(formCss),'buttons 13/40');
  ok(/\.switch\{[^}]*font-size:12px/.test(formCss),'sign in 12');
  ok(/\.help\{font-size:11px/.test(formCss),'helpers 11');
  ok(/\.chips li\{[^}]*font-size:11px/.test(formCss),'chips 11 not 10');
  ok(!/font-size:10px/.test(formCss),'must not drop chips (or anything) to 10px');
});

await T('locked Ericson spacing is on the form panel',()=>{
  ok(/\.form \.sub\{[^}]*line-height:1\.4[^}]*margin-top:4px/.test(formCss),'sub lh 1.4 / mt 4');
  ok(/\.chips\{[^}]*gap:6px/.test(formCss),'chips gap 6');
  ok(/\.chips\{[^}]*margin:8px 0 0/.test(formCss),'chips mt 8');
  ok(/padding:3px 10px/.test(formCss),'chips padding 3 10');
  ok(/border:1\.5px solid var\(--line\);border-radius:10px/.test(formCss),'inputs 1.5 / radius 10');
  ok(/\.panel\{[^}]*padding:18px 28px 14px/.test(formCss),'panel 18 top / 14 bottom');
  ok(/\.panel\{[^}]*align-items:center/.test(formCss),'vertically center when it fits');
  ok(/\.f\{[^}]*gap:3px;margin-top:8px/.test(formCss),'field stack 8 / label gap 3');
  ok(/\.cta\{margin-top:10px\}/.test(formCss),'cta 10');
  ok(/\.or\{[^}]*margin:8px 0/.test(formCss),'or 8');
  ok(/\.switch\{[^}]*margin-top:8px/.test(formCss),'switch 8');
  ok(/\.trust\{[^}]*margin-top:6px/.test(formCss),'trust 6');
});

await T('brand panel locked indent and two-line headline stay put',()=>{
  ok(/\.brand \.copy\{[^}]*padding-left:68px/.test(brandCss),'wordmark indent');
  ok(/\.brand h1\{[^}]*clamp\(28px,3\.2vw,40px\)/.test(brandCss),'brand h1 clamp');
  ok(/<span class="line1">Every Agent has a number\.<\/span><br>Start the journey\./.test(html),
     'two-line headline markup');
  ok(/min-width:1400px[\s\S]*\.brand h1 \.line1\{white-space:nowrap\}/.test(html),
     'Line 1 nowrap at desktop');
});

await T('copy, chips, and button labels are unchanged',()=>{
  ok(/<h2>Become an Agent<\/h2>/.test(html),'H2');
  ok(/<p class="sub">Create your account\. You start as a Guest; your Agent number comes with confirmation\.<\/p>/.test(html),'sub');
  eq(html.match(/<ul class="chips"[^>]*>([\s\S]*?)<\/ul>/)[1].match(/<li>([^<]+)<\/li>/g),
     ['<li>Exchange</li>','<li>Portal benefits</li>','<li>Verified network</li>'],
     'chip labels');
  ok(/>Create my Agent account<\/button>/.test(html),'primary CTA');
  ok(/Fastest: Continue with Google/.test(html),'Google label');
  ok(/Already an Agent\? <a href="signin.html">Sign in<\/a>/.test(html),'switch copy');
});

await T('modal CTAs keep the original 15/44 tap target',()=>{
  ok(/\.btn\{[^}]*min-height:44px[^}]*font-size:15px/.test(html),'global btn 15/44');
  ok(/\.form \.btn\{/.test(formCss),'form overrides, modal does not');
});

const br=await chromium.launch({channel:'chrome'}).catch(()=>chromium.launch());
await T('at 1440×840, Sign in and the legal line sit inside the viewport',async()=>{
  const p=await br.newPage({viewport:{width:1440,height:840}});
  await p.goto(`${BASE}/signup.html`,{waitUntil:'load'});
  const sw=await p.locator('.switch').boundingBox();
  const trust=await p.locator('.trust').boundingBox();
  ok(sw&&trust,'switch and trust present');
  ok(sw.y+sw.height<=840,`Sign in bottom ${sw.y+sw.height} must be ≤840`);
  ok(trust.y+trust.height<=840,`legal line bottom ${trust.y+trust.height} must be ≤840`);
  const h2=await p.locator('.form h2').evaluate(el=>getComputedStyle(el).fontSize);
  const sub=await p.locator('.form .sub').evaluate(el=>getComputedStyle(el).fontSize);
  const btn=await p.locator('.form .btn-gold').evaluate(el=>getComputedStyle(el).minHeight);
  eq(h2,'22px','computed headline');
  eq(sub,'13px','computed sub');
  eq(btn,'40px','computed CTA min-height');
  const pad=await p.locator('.brand .copy').evaluate(el=>getComputedStyle(el).paddingLeft);
  eq(pad,'68px','brand indent still 68px');
  await p.close();
});

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
