/* Signup copy must not promise an Agent number at join. Guests are Guests
 * until PAAIPE confirms them; the right-panel sub is the sentence that
 * says so. This suite exists because the page once claimed the number
 * was assigned the moment you join. */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const BASE=process.env.PAAIPE_BASE||'http://127.0.0.1:8899', ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
let pass=0,fail=0;
const T=async(n,f)=>{try{await f();console.log(`  PASS  ${n}`);pass++}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++}};
const ok=(c,m)=>{if(!c)throw new Error(m)};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)};

const html=readFileSync(`${ROOT}/signup.html`,'utf8');

await T('right-panel sub is honest about Guest then confirmation',()=>{
  ok(/<p class="sub">Create your account\. You start as a Guest; your Agent number comes with confirmation\.<\/p>/.test(html),
     'missing honesty sentence');
  ok(!/assigned the moment you join/.test(html),
     'must not promise an Agent number at join');
});

await T('H2 and primary CTA stay Become an Agent / Create my Agent account',()=>{
  ok(/<h2>Become an Agent<\/h2>/.test(html),'H2');
  ok(/>Create my Agent account<\/button>/.test(html),'CTA');
});

await T('optional next-step under the primary CTA',()=>{
  ok(/Next: verify email → portal as Guest\./.test(html),'next hint');
});

await T('value chips name Exchange, Portal benefits, Verified network',()=>{
  const m=html.match(/<ul class="chips"[^>]*>([\s\S]*?)<\/ul>/);
  ok(m,'chips list');
  eq(m[1].match(/<li>([^<]+)<\/li>/g),
     ['<li>Exchange</li>','<li>Portal benefits</li>','<li>Verified network</li>'],
     'chip labels');
});

await T('Google is equal-weight and labelled Fastest',()=>{
  ok(/Fastest: Continue with Google/.test(html),'Google label');
  ok(/\.btn-ghost\{[^}]*border:2px solid var\(--navy\)/.test(html),
     'Google uses a navy border, not the pale line');
});

await T('password meter is three steps; blur and submit require 8+ with a number or symbol',()=>{
  ok(/<div class="meter"[^>]*>\s*<i><\/i><i><\/i><i><\/i>\s*<\/div>/.test(html),'three bars');
  ok(/Use 8\+ characters with a number or symbol\./.test(html),'rule copy');
  ok(/Password needs 8\+ characters with a number or symbol\./.test(html),'error copy');
  ok(/if\(r\.type==='password'\)return score\(r\.value\)<2/.test(html),
     'submit/blur must use the meter rule, not length-only');
  ok(!/Inter/.test(html),'public signup stays Poppins');
  ok(/family=Poppins/.test(html),'Poppins loaded');
});

await T('inline blur validation is wired for name, email, password',()=>{
  ok(/addEventListener\('blur'/.test(html),'blur listener');
  ok(/\[nm,em,pw\]/.test(html),'the three fields');
});

await T('mobile Guest → Agent pill is under the kicker and hidden on desktop',()=>{
  ok(/<span class="journey">Guest → Agent on confirm<\/span>/.test(html),'pill copy');
  ok(/\.journey\{display:none/.test(html),'hidden by default');
  ok(/max-width:980px[\s\S]*\.journey\{display:inline-flex\}/.test(html),
     'shown at ≤980');
});

const br=await chromium.launch();
const errs=[];

await T('blur on an empty name shows the field error',async()=>{
  const p=await br.newPage();
  p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`${BASE}/signup.html`,{waitUntil:'load'});
  await p.focus('#nm');
  await p.locator('#em').focus();
  ok(await p.locator('#nm').evaluate(el=>el.closest('.f').classList.contains('invalid')),
     'name field should be invalid after blur');
  ok(await p.locator('#nm + .err').isVisible(),'name error visible');
  await p.close();
});

await T('blur and submit reject 8 letters with no number or symbol',async()=>{
  const p=await br.newPage();
  await p.goto(`${BASE}/signup.html`,{waitUntil:'load'});
  await p.fill('#pw','password');
  await p.locator('#nm').focus();
  ok(await p.locator('#pw').evaluate(el=>el.closest('.f').classList.contains('invalid')),
     '8 letters is still weak, so blur must flag it');
  ok(await p.getByText('Password needs 8+ characters with a number or symbol.').isVisible(),
     'aligned error visible');
  await p.fill('#nm','Juan Dela Cruz');
  await p.fill('#em','juan@example.com');
  await p.check('#tos');
  await p.click('[type=submit]');
  ok(await p.locator('#pw').evaluate(el=>el.closest('.f').classList.contains('invalid')),
     'submit must not pass a letters-only password');
  eq((await p.locator('[type=submit]').innerText()).trim(),'Create my Agent account',
     'must not start creating the account');
  await p.fill('#pw','password1');
  await p.locator('#nm').focus();
  ok(!(await p.locator('#pw').evaluate(el=>el.closest('.f').classList.contains('invalid'))),
     '8+ with a number is enough');
  await p.close();
});

await T('meter steps weak → ok → strong on the 8+ number-or-symbol rule',async()=>{
  const p=await br.newPage();
  await p.goto(`${BASE}/signup.html`,{waitUntil:'load'});
  await p.fill('#pw','short');
  eq(await p.getAttribute('#meter','data-s'),'1','short is weak');
  eq(await p.locator('#meterl').innerText(),'Weak','weak label');
  await p.fill('#pw','password1');
  eq(await p.getAttribute('#meter','data-s'),'2','8+ with a number is ok');
  eq(await p.locator('#meterl').innerText(),'Ok','ok label');
  await p.fill('#pw','Password1!');
  eq(await p.getAttribute('#meter','data-s'),'3','mixed + number + symbol is strong');
  eq(await p.locator('#meterl').innerText(),'Strong','strong label');
  await p.close();
});

await T('Guest → Agent pill is visible only at ≤980',async()=>{
  const d=await br.newPage();
  await d.setViewportSize({width:1280,height:800});
  await d.goto(`${BASE}/signup.html`,{waitUntil:'load'});
  ok(!(await d.locator('.journey').isVisible()),'hidden on desktop');
  await d.close();
  const m=await br.newPage();
  await m.setViewportSize({width:980,height:900});
  await m.goto(`${BASE}/signup.html`,{waitUntil:'load'});
  ok(await m.locator('.journey').isVisible(),'visible at 980');
  eq((await m.locator('.journey').innerText()).trim(),'Guest → Agent on confirm','pill text');
  await m.close();
});

await T('no console errors',()=>ok(errs.length===0,errs.join(' | ')));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
