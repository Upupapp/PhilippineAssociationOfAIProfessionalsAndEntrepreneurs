/* The October AI Exchange share card is HTML, not JavaScript: crawlers read
 * og:image without running a browser. The generic site banner is for every
 * other page; this suite exists so the event and register pages cannot drift
 * back to it while the on-page covers stay on the wide banner. */
import { readFileSync, existsSync } from 'fs';
const ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
let pass=0,fail=0;
const T=async(n,f)=>{try{await f();console.log(`  PASS  ${n}`);pass++}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++}};
const ok=(c,m)=>{if(!c)throw new Error(m)};

const OG='https://paaipe.org/assets/img/ai-exchange-2026-10-og.png';
const GENERIC='https://paaipe.org/assets/img/paaipe-share-banner.png';
const ALT='PAAIPE AI Exchange — October 13, 2026 · Online';
const PAGES=['event-2026-10-ai-exchange.html','register-2026-10-ai-exchange.html'];
const OTHERS=['index.html','events.html','event-2026-09-ai-exchange.html','event-2026-11-ai-exchange.html','event-2026-12-ai-exchange.html'];

function meta(html, attr, name){
  const re=new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`);
  const m=html.match(re);
  if(!m) throw new Error(`missing ${name}`);
  return m[1];
}

await T('the OG PNG is in the repo at 1200×630',()=>{
  const p=`${ROOT}/assets/img/ai-exchange-2026-10-og.png`;
  ok(existsSync(p),'asset missing');
  const b=readFileSync(p);
  ok(b[0]===0x89 && b[1]===0x50 && b[2]===0x4e && b[3]===0x47, 'not a PNG');
  const w=b.readUInt32BE(16), h=b.readUInt32BE(20);
  ok(w===1200 && h===630, `got ${w}×${h}`);
});

for(const page of PAGES){
  const html=readFileSync(`${ROOT}/${page}`,'utf8');
  await T(`${page} points og:image at the October card`,()=>{
    ok(meta(html,'property','og:image')===OG, meta(html,'property','og:image'));
    ok(meta(html,'property','og:image:secure_url')===OG,'secure_url');
    ok(meta(html,'property','og:image:type')==='image/png','type');
    ok(meta(html,'property','og:image:width')==='1200','width');
    ok(meta(html,'property','og:image:height')==='630','height');
    ok(meta(html,'property','og:image:alt')===ALT, meta(html,'property','og:image:alt'));
  });
  await T(`${page} points twitter:image at the same card`,()=>{
    ok(meta(html,'name','twitter:image')===OG, meta(html,'name','twitter:image'));
    ok(meta(html,'name','twitter:image:alt')===ALT, meta(html,'name','twitter:image:alt'));
  });
  await T(`${page} did not swap the on-page cover for the OG card`,()=>{
    ok(/assets\/img\/ai-exchange-2026-10-banner-wide\.png/.test(html),'wide banner gone from the body');
    ok(!/src="assets\/img\/ai-exchange-2026-10-og\.png"/.test(html),'OG card used as a page image');
  });
}

await T('the generic site banner is still what other pages share',()=>{
  for(const page of OTHERS){
    const html=readFileSync(`${ROOT}/${page}`,'utf8');
    ok(html.includes(GENERIC), `${page} lost the generic share banner`);
    ok(!html.includes(OG), `${page} picked up the October card`);
  }
});

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail?1:0);
