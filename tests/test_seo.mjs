/* Technical SEO contract for the public marketing site.
 *
 * File-only: crawlers read tags without a browser. This suite exists so
 * robots.txt, sitemap.xml, canonicals, JSON-LD and noindex cannot drift
 * after the 2026-09 sweep.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
const ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
let pass=0,fail=0;
const T=async(n,f)=>{try{await f();console.log(`  PASS  ${n}`);pass++}catch(e){console.log(`  FAIL  ${n}\n        ${e.message}`);fail++}};
const ok=(c,m)=>{if(!c)throw new Error(m)};
const read=p=>readFileSync(join(ROOT,p),'utf8');

const PUBLIC=[
  'index.html','programs.html','events.html',
  'event-2026-09-ai-exchange.html','event-2026-10-ai-exchange.html',
  'event-2026-11-ai-exchange.html','event-2026-12-ai-exchange.html',
  'register-2026-10-ai-exchange.html','register-2026-11-ai-exchange.html',
  'register-2026-12-ai-exchange.html','resources.html','member-benefits.html',
  'partners.html','partner-gethired.html','partner-servana.html',
  'partner-mvj.html','partner-dpdigital.html','signup.html','signin.html',
  'privacy-notice.html','terms-of-use.html'
];
const SITEMAP_PATHS=[
  'https://paaipe.org/','https://paaipe.org/programs','https://paaipe.org/events',
  'https://paaipe.org/event-2026-09-ai-exchange','https://paaipe.org/event-2026-10-ai-exchange',
  'https://paaipe.org/event-2026-11-ai-exchange','https://paaipe.org/event-2026-12-ai-exchange',
  'https://paaipe.org/register-2026-10-ai-exchange','https://paaipe.org/register-2026-11-ai-exchange',
  'https://paaipe.org/register-2026-12-ai-exchange','https://paaipe.org/resources',
  'https://paaipe.org/member-benefits','https://paaipe.org/partners',
  'https://paaipe.org/partner-gethired','https://paaipe.org/partner-servana',
  'https://paaipe.org/partner-mvj','https://paaipe.org/partner-dpdigital',
  'https://paaipe.org/signup','https://paaipe.org/signin',
  'https://paaipe.org/privacy-notice','https://paaipe.org/terms-of-use'
];
const NOINDEX_UTILITY=['forgot-password.html','register-success.html'];
const SHARE='https://paaipe.org/assets/img/paaipe-share-banner.png';
const OCT_OG='https://paaipe.org/assets/img/ai-exchange-2026-10-og.png';

function meta(html, attr, name){
  const re=new RegExp(`<meta[^>]+${attr}="${name}"[^>]*content="([^"]*)"`,'i');
  const m=html.match(re);
  if(!m) throw new Error(`missing ${name}`);
  return m[1];
}
function jsonld(html){
  const blocks=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return blocks.map(b=>JSON.parse(b[1].trim()));
}
function rootHtml(){
  return readdirSync(ROOT).filter(f=>f.endsWith('.html'));
}

await T('robots.txt allows public pages and points at the sitemap',()=>{
  ok(existsSync(join(ROOT,'robots.txt')),'robots.txt missing');
  const t=read('robots.txt');
  ok(/User-agent:\s*\*/.test(t),'User-agent');
  ok(/Allow:\s*\//.test(t),'Allow /');
  ok(/Disallow:\s*\/admin/.test(t),'Disallow /admin');
  ok(/Disallow:\s*\/portal/.test(t),'Disallow /portal');
  ok(/Disallow:\s*\/artifacts\//.test(t),'Disallow /artifacts/');
  ok(/Disallow:\s*\/assets\/email\//.test(t),'Disallow email templates');
  ok(/Disallow:\s*\/tests\//.test(t),'Disallow /tests/');
  ok(/Disallow:\s*\/scripts\//.test(t),'Disallow /scripts/');
  ok(t.includes('Sitemap: https://paaipe.org/sitemap.xml'),'Sitemap URL');
  ok(!/Disallow:\s*\/$/.test(t),'must not disallow the homepage');
});

await T('sitemap.xml lists only indexable public HTTPS URLs',()=>{
  const xml=read('sitemap.xml');
  ok(xml.includes('http://www.sitemaps.org/schemas/sitemap/0.9'),'urlset xmlns');
  const locs=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
  ok(locs.length===SITEMAP_PATHS.length,`expected ${SITEMAP_PATHS.length} urls, got ${locs.length}`);
  for(const u of SITEMAP_PATHS) ok(locs.includes(u),`missing ${u}`);
  for(const u of locs){
    ok(u.startsWith('https://paaipe.org/'),`not absolute https: ${u}`);
    ok(!u.endsWith('.html'),`extensionless only: ${u}`);
    ok(!/admin|portal|artifacts|email|forgot-password|register-success|tests\//.test(u),
      `private/utility leaked: ${u}`);
  }
});

await T('every public marketing page has unique title, description, canonical, OG and Twitter',()=>{
  const titles=new Set(), descs=new Set();
  for(const f of PUBLIC){
    const html=read(f);
    const title=(html.match(/<title>([^<]+)<\/title>/)||[])[1];
    ok(title&&title.length>8,`${f} title`);
    ok(!titles.has(title),`duplicate title: ${title}`);
    titles.add(title);
    const desc=meta(html,'name','description');
    ok(desc.length>40,`${f} description too short`);
    ok(!descs.has(desc),`duplicate description on ${f}`);
    descs.add(desc);
    const canon=(html.match(/<link rel="canonical" href="([^"]+)"/)||[])[1];
    ok(canon&&canon.startsWith('https://paaipe.org'),`${f} canonical`);
    ok(!canon.endsWith('.html'),`${f} canonical should be extensionless`);
    ok(meta(html,'property','og:type')==='website',`${f} og:type`);
    ok(meta(html,'property','og:site_name')==='PAAIPE',`${f} og:site_name`);
    ok(meta(html,'property','og:locale')==='en_PH',`${f} og:locale`);
    ok(meta(html,'property','og:url')===canon,`${f} og:url must match canonical`);
    ok(meta(html,'property','og:title'),`${f} og:title`);
    ok(meta(html,'property','og:description'),`${f} og:description`);
    const img=meta(html,'property','og:image');
    ok(img===SHARE||img===OCT_OG,`${f} unexpected og:image ${img}`);
    ok(meta(html,'name','twitter:card')==='summary_large_image',`${f} twitter:card`);
    ok(meta(html,'name','twitter:image')===img,`${f} twitter:image`);
    ok(!/name="robots"/.test(html),`${f} must stay indexable`);
  }
});

await T('homepage has Organization JSON-LD with name, url and logo only',()=>{
  const docs=jsonld(read('index.html'));
  ok(docs.length===1,`expected one JSON-LD block, got ${docs.length}`);
  const o=docs[0];
  ok(o['@type']==='Organization','@type');
  ok(o.name==='Philippine Association of AI Professionals and Entrepreneurs','name');
  ok(o.url==='https://paaipe.org/','url');
  ok(o.logo==='https://paaipe.org/assets/img/paaipe-logo.png','logo');
  ok(!o.foundingDate&&!o.numberOfEmployees&&!o.aggregateRating,'do not invent org stats');
});

await T('each published AI Exchange page has Event JSON-LD using the on-page dates',()=>{
  const expected={
    'event-2026-09-ai-exchange.html':{
      name:'PAAIPE AI Exchange — September 2026',
      startDate:'2026-09-15T20:00:00+08:00',
      endDate:'2026-09-15T21:30:00+08:00',
      url:'https://paaipe.org/event-2026-09-ai-exchange',
      performer:'Sven Bally'
    },
    'event-2026-10-ai-exchange.html':{
      name:'PAAIPE AI Exchange — October 2026',
      startDate:'2026-10-13T20:00:00+08:00',
      endDate:'2026-10-13T21:30:00+08:00',
      url:'https://paaipe.org/event-2026-10-ai-exchange'
    },
    'event-2026-11-ai-exchange.html':{
      name:'PAAIPE AI Exchange — November 2026',
      startDate:'2026-11-10T20:00:00+08:00',
      endDate:'2026-11-10T21:30:00+08:00',
      url:'https://paaipe.org/event-2026-11-ai-exchange'
    },
    'event-2026-12-ai-exchange.html':{
      name:'PAAIPE AI Exchange — December 2026',
      startDate:'2026-12-08T20:00:00+08:00',
      endDate:'2026-12-08T21:30:00+08:00',
      url:'https://paaipe.org/event-2026-12-ai-exchange'
    }
  };
  for(const [f,want] of Object.entries(expected)){
    const docs=jsonld(read(f));
    ok(docs.length===1,`${f} JSON-LD count`);
    const e=docs[0];
    ok(e['@type']==='Event',`${f} @type`);
    ok(e.name===want.name,`${f} name`);
    ok(e.startDate===want.startDate,`${f} startDate`);
    ok(e.endDate===want.endDate,`${f} endDate`);
    ok(e.url===want.url,`${f} url`);
    ok(e.eventAttendanceMode==='https://schema.org/OnlineEventAttendanceMode',`${f} online`);
    ok(e.location&&e.location['@type']==='VirtualLocation',`${f} VirtualLocation`);
    ok(e.organizer&&e.organizer.url==='https://paaipe.org/',`${f} organizer`);
    if(want.performer) ok(e.performer&&e.performer.name===want.performer,`${f} performer`);
    else ok(!e.performer,`${f} must not invent a speaker`);
    ok(!e.maximumAttendeeCapacity&&!('attendeeCount' in e),`${f} must not invent attendance`);
  }
});

await T('events listing has one h1; resources keeps a single visible-page h1',()=>{
  const events=read('events.html');
  const eh1=[...events.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
  ok(eh1.length===1,`events.html h1 count ${eh1.length}`);
  ok(/Events/.test(eh1[0][1]),'events h1 names the page');
  const res=read('resources.html');
  const noscript=(res.match(/<noscript>[\s\S]*?<\/noscript>/)||[''])[0];
  const body=res.replace(/<noscript>[\s\S]*?<\/noscript>/,'');
  const rh1=[...body.matchAll(/<h1\b[^>]*>/g)];
  ok(rh1.length===1,`resources.html should have one h1 outside noscript, got ${rh1.length}`);
  ok(!/<h1\b/i.test(noscript),'noscript must not use a second h1');
});

await T('admin and portal HTML stay noindex; Inter is not swapped for Poppins',()=>{
  const files=rootHtml().filter(f=>f.startsWith('admin')||f.startsWith('portal'));
  ok(files.length>=20,`expected admin+portal surfaces, got ${files.length}`);
  for(const f of files){
    const html=read(f);
    ok(/name="robots" content="noindex,nofollow"/.test(html),`${f} noindex`);
    ok(/family=Inter/.test(html),`${f} must keep Inter`);
    ok(!/family=Poppins/.test(html),`${f} must not load Poppins`);
  }
});

await T('utility, fixture and email HTML are noindex and off the sitemap',()=>{
  const sitemap=read('sitemap.xml');
  for(const f of NOINDEX_UTILITY){
    const html=read(f);
    ok(/name="robots" content="noindex,follow"/.test(html),`${f} robots`);
  }
  const fixture='artifacts/learnings-screens-fixture.html';
  const demo='artifacts/motion-tokens-v1/demo.html';
  const email='assets/email/paaipe-email-template.html';
  for(const f of [fixture,demo,email]){
    ok(/name="robots" content="noindex,nofollow"/.test(read(f)),`${f} robots`);
  }
  ok(!sitemap.includes('forgot-password'),'sitemap forgot-password');
  ok(!sitemap.includes('register-success'),'sitemap register-success');
  ok(!sitemap.includes('artifacts'),'sitemap artifacts');
  ok(!sitemap.includes('/admin'),'sitemap admin');
  ok(!sitemap.includes('/portal'),'sitemap portal');
});

await T('netlify.toml has no X-Robots noindex and does close .html duplicates',()=>{
  const t=read('netlify.toml');
  ok(!/X-Robots-Tag/i.test(t),'no accidental noindex header');
  ok(/from = "\/index\.html"/.test(t),'index.html → /');
  ok(/from = "\/\*\.html"/.test(t),'*.html → extensionless');
  ok(/to = "\/:splat"/.test(t),'splat target');
  ok(/status = 301/.test(t),'301');
});

await T('signup brand headline is still the locked two lines',()=>{
  const html=read('signup.html');
  ok(/Every Agent has a number/.test(html),'line 1');
  ok(/Start the journey/.test(html),'line 2');
});

await T('public pages still load Poppins, not Inter',()=>{
  for(const f of ['index.html','signup.html','events.html','programs.html']){
    const html=read(f);
    ok(/family=Poppins/.test(html),`${f} Poppins`);
    ok(!/family=Inter/.test(html),`${f} Inter`);
  }
});

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail?1:0);
