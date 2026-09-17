/* Agent profile photo: chrome camera badge, Profile section, crop, honest Storage stub. */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const BASE=process.env.PAAIPE_BASE||'http://127.0.0.1:8899', ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
const REAL_FB=readFileSync(`${ROOT}/assets/js/paaipe-firebase.js`,'utf8');
const RULES=readFileSync(`${ROOT}/firestore.rules`,'utf8');
let pass=0,fail=0;
const T=async(n,f)=>{try{await f();console.log(`  PASS  ${n}`);pass++}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++}};
const ok=(c,m)=>{if(!c)throw new Error(m)};
const eq=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)};

const fbStub=({signedIn=true,status='agent',emailVerified=true,photoUrl='',full_name='Maria Santos'}={})=>`
  export * from '/assets/js/paaipe-firebase-real.js';
  export function isConfigured(){return true}
  export async function currentAgent(){
    return ${signedIn}?{
      uid:'u1', email:'maria@example.com', full_name:${JSON.stringify(full_name)},
      status:'${status}', isAgent:${status==='agent'}, emailVerified:${emailVerified},
      photoUrl:${JSON.stringify(photoUrl)}, directoryVisible:false,
      agentNumber:${status==='agent'?'"0006"':'null'}, confirmationSeen:true
    }:null}`;

const br=await chromium.launch();
const errs=[];
async function open(path, opts={}){
  const ctx=await br.newContext({viewport:{width:1280,height:900}});
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/assets/js/paaipe-firebase-real.js',r=>r.fulfill({contentType:'text/javascript',body:REAL_FB}));
  await p.route('**/assets/js/paaipe-firebase.js',r=>r.fulfill({contentType:'text/javascript',body:fbStub(opts)}));
  await p.goto(`${BASE}/${path}`,{waitUntil:'load'});
  await p.waitForSelector('html[data-photo-ready]',{timeout:9000});
  return {p, ctx};
}

await T('the Storage contract is coded and the stub is on',()=>{
  ok(/AGENT_PHOTO_STORAGE_READY\s*=\s*false/.test(REAL_FB),'READY stays false');
  ok(/agents\/\$\{uid\}\/profile\.\$\{ext\}/.test(REAL_FB),'path agents/{uid}/profile.{ext}');
  ok(/AGENT_PHOTO_FIELD\s*=\s*"photoUrl"/.test(REAL_FB),'field is photoUrl');
  ok(!/updateProfile\(user,\s*\{\s*photoURL/.test(REAL_FB),'must not write Auth photoURL');
});

await T('self hasOnly does not allow photoUrl yet',()=>{
  const m=RULES.match(/match \/paaipe_agents\/\{uid\}[\s\S]*?allow update: if request\.auth != null && request\.auth\.uid == uid[\s\S]*?hasOnly\(\[([^\]]+)\]\)/);
  ok(m,'found member self-update hasOnly');
  ok(!/photoUrl|photoURL/.test(m[1]),`must not patch photoUrl yet: ${m[1]}`);
});

await T('sidebar and header avatars become camera-badge buttons',async()=>{
  const {p,ctx}=await open('portal.html');
  const n=await p.locator('[data-change-photo]').count();
  eq(n,2,'sidebar + header');
  ok(await p.locator('.side .me [data-change-photo] .av-cam').isVisible(),'sidebar camera');
  ok(await p.locator('header.top [data-change-photo] .av-cam').isVisible(),'header camera');
  ok(await p.locator('.side .me [data-change-photo] .av').isVisible(),'initials av kept');
  const letters=(await p.locator('.side .me [data-agent-initials]').innerText()).trim();
  ok(/MS/.test(letters),`initials fallback, got ${letters}`);
  await ctx.close();
});

await T('community compose and directory You card are not change-photo buttons',async()=>{
  const {p,ctx}=await open('portal-community.html');
  eq(await p.locator('.compose [data-change-photo]').count(),0,'compose is not a picker');
  ok(await p.locator('.compose [data-agent-initials]').count()>0,'compose still hydrates');
  await ctx.close();
  const {p:p2,ctx:c2}=await open('portal-directory.html');
  eq(await p2.locator('.agent [data-change-photo]').count(),0,'directory You is not chrome');
  await c2.close();
});

await T('My Profile helper names the Storage stub clearly',async()=>{
  const {p,ctx}=await open('portal-profile.html');
  ok(await p.locator('[data-profile-photo]').isVisible(),'section');
  ok(await p.locator('[data-profile-photo] .pp-preview').isVisible(),'large preview');
  const up=(await p.locator('[data-photo-upload]').innerText()).trim();
  ok(/Upload/i.test(up),`upload label: ${up}`);
  ok(await p.locator('[data-photo-remove]').isDisabled(),'Remove idle without a photo');
  const help=(await p.locator('[data-photo-help]').innerText());
  ok(/JPG|PNG/i.test(help),'format');
  ok(/WebP/i.test(help),'webp in the contract');
  ok(/2 MB/i.test(help),'max size');
  ok(/square/i.test(help),'square crop');
  ok(/Storage is not wired/i.test(help),`stub named: ${help}`);
  ok(/will not upload|Nothing was uploaded|not change your profile/i.test(help),'no fake save');
  ok(!/Guest/i.test(help),'agent helper does not call them a Guest');
  await ctx.close();
});

await T('a Guest is told they are a Guest; Storage stub still honest',async()=>{
  const {p,ctx}=await open('portal-profile.html',{status:'guest',emailVerified:true});
  const help=(await p.locator('[data-photo-help]').innerText());
  ok(/Guest/i.test(help),`guest named: ${help}`);
  ok(/Storage is not wired/i.test(help),'storage still honest for guests');
  await ctx.close();
});

await T('chrome click on Profile does not navigate or reload',async()=>{
  const {p,ctx}=await open('portal-profile.html');
  const before=p.url();
  await p.locator('.side .me [data-change-photo]').click();
  eq(p.url(),before,'must not leave Profile');
  await p.locator('header.top [data-change-photo]').click();
  eq(p.url(),before,'header either');
  ok(/portal-profile/.test(p.url()),'still on profile');
  await ctx.close();
});

await T('a photoUrl paints every data-agent-initials surface, including chrome',async()=>{
  const {p,ctx}=await open('portal-profile.html',{
    photoUrl:'assets/img/agents/agent-001-paul-espinas.png'});
  const n=await p.locator('[data-agent-initials] img[data-agent-photo]').count();
  ok(n>=3,`preview + sidebar + header, got ${n}`);
  ok(await p.locator('.side .me img[data-agent-photo]').isVisible(),'sidebar photo');
  ok(await p.locator('header.top img[data-agent-photo]').isVisible(),'header photo');
  ok(await p.locator('[data-profile-photo] img[data-agent-photo]').isVisible(),'preview photo');
  const up=(await p.locator('[data-photo-upload]').innerText()).trim();
  ok(/Change/i.test(up),`change when set: ${up}`);
  ok(!(await p.locator('[data-photo-remove]').isDisabled()),'Remove enabled');
  await ctx.close();
});

await T('crop then Save is the Storage stub — never fake success, never a URL',async()=>{
  const {p,ctx}=await open('portal-profile.html');
  await p.locator('[data-photo-file]').setInputFiles(`${ROOT}/assets/img/agents/agent-001-paul-espinas.png`);
  await p.waitForSelector('[data-photo-crop][open], dialog[data-photo-crop]',{timeout:9000});
  ok(await p.locator('[data-photo-crop]').isVisible(),'crop modal');
  await p.locator('[data-photo-crop-save]').click();
  await p.waitForFunction(()=>{
    const a=document.querySelector('[data-photo-crop-err]');
    const b=document.querySelector('[data-photo-msg]');
    return (a&&a.textContent.trim())||(b&&b.textContent.trim());
  },null,{timeout:9000});
  const cropErr=(await p.locator('[data-photo-crop-err]').innerText());
  const pageMsg=(await p.locator('[data-photo-msg]').innerText());
  const text=cropErr+' '+pageMsg;
  ok(/Storage is not wired/i.test(text),`stub: ${text}`);
  ok(/Nothing was uploaded|not change/i.test(text),`no write: ${text}`);
  ok(!/Photo updated|saved successfully|your photo is set/i.test(text),
     `must not claim success: ${text}`);
  eq(await p.locator('.side .me img[data-agent-photo]').count(),0,
     'chrome must not show a fake photo after a failed save');
  await ctx.close();
});

await T('a GIF is refused before the crop modal',async()=>{
  const {p,ctx}=await open('portal-profile.html');
  await p.locator('[data-photo-file]').setInputFiles({
    name:'anim.gif', mimeType:'image/gif',
    buffer:readFileSync(`${ROOT}/assets/img/paaipe-logo.png`)});
  const msg=await p.locator('[data-photo-msg]').innerText();
  ok(/GIF/i.test(msg),`gif refused: ${msg}`);
  eq(await p.locator('[data-photo-crop][open]').count(),0,'no crop for gif');
  await ctx.close();
});

await T('no console errors',()=>ok(errs.length===0,errs.join(' | ')));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();process.exit(fail?1:0);
