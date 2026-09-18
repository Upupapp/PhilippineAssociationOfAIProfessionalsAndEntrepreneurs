/* The LIVE rules on paaipe.org, as an anonymous visitor sees them.
 *
 * No credentials, so it runs anywhere and is safe to run before and after a
 * rules deploy. A stubbed test cannot catch a rules mistake — only a real
 * request against the real ruleset can, which is why this exists.
 *
 *   node tests/test_liverules.mjs
 */
import { readFileSync } from 'fs';
const ROOT=process.env.PAAIPE_ROOT||'/Users/user/Philippine-Association-of-AI';
const src=readFileSync(`${ROOT}/assets/js/paaipe-firebase.js`,'utf8');
const pick=k=>src.match(new RegExp(`${k}:\\s*"([^"]+)"`))?.[1];
const KEY=pick('apiKey'), PROJ=pick('projectId');
const DB=src.match(/DATABASE_ID\s*=\s*"([^"]+)"/)?.[1]||'paaipe';
const B=`https://firestore.googleapis.com/v1/projects/${PROJ}/databases/${DB}/documents`;
let pass=0,fail=0;
const T=(n,c,m)=>{if(c){console.log(`  PASS  ${n}`);pass++}else{console.log(`  FAIL  ${n}\n        ${m}`);fail++}};

const q=async body=>{
  const r=await fetch(`${B}:runQuery?key=${KEY}`,{method:'POST',
    headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  return {status:r.status,text:(await r.text()).slice(0,140)};
};
const from=c=>[{collectionId:c}];
const inFilter=(f,vals)=>({fieldFilter:{field:{fieldPath:f},op:'IN',
  value:{arrayValue:{values:vals.map(v=>({stringValue:v}))}}}});

const PUBLIC=['published','registration_open','registration_closed','held','cancelled'];

/* --- what a visitor MAY read ------------------------------------------- */
let r=await q({structuredQuery:{from:from('paaipe_events'),where:inFilter('status',PUBLIC)}});
T('a visitor may list events constrained to public statuses',r.status===200,`got ${r.status}: ${r.text}`);
const shown=r.text;

r=await q({structuredQuery:{from:from('paaipe_event_sponsors'),
  where:inFilter('status',['confirmed','delivered'])}});
T('a visitor may list confirmed sponsorships',r.status===200,`got ${r.status}`);

r=await q({structuredQuery:{from:from('paaipe_organizations'),
  where:{fieldFilter:{field:{fieldPath:'status'},op:'EQUAL',value:{stringValue:'active'}}}}});
T('a visitor may list confirmed (active) organizations',r.status===200,`got ${r.status}: ${r.text}`);

/* --- what a visitor may NOT --------------------------------------------- */
r=await q({structuredQuery:{from:from('paaipe_events')}});
T('an UNCONSTRAINED event list is refused, because a rule cannot filter one',
  r.status===403,`got ${r.status} — a conditional rule must refuse the whole query`);

r=await q({structuredQuery:{from:from('paaipe_event_sponsors')}});
T('an unconstrained sponsorship list is refused too',r.status===403,`got ${r.status}`);

for(const [col,why] of [['paaipe_event_registrations','other people\'s personal data (RA 10173)'],
                        ['paaipe_partner_applications','who else is bidding to sponsor'],
                        ['paaipe_activity_log','the audit trail'],
                        ['paaipe_event_private','the Zoom link'],
                        ['paaipe_counters','nothing may read or write it']]){
  const x=await fetch(`${B}/${col}?key=${KEY}&pageSize=1`);
  T(`${col} is closed to the public — ${why}`,x.status===403,`got ${x.status}`);
}

/* --- a draft must be absent, not merely hidden -------------------------- */
T('no draft event appears in what a visitor is served',!/"draft"/.test(shown),
  'a draft leaked into the public event list');

/* --- the write rules still bite ----------------------------------------- */
const commit=async (col,id,fields,transforms)=>{
  const r=await fetch(`${B}:commit?key=${KEY}`,{method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({writes:[{update:{name:`projects/${PROJ}/databases/${DB}/documents/${col}/${id}`,fields},
      updateMask:{fieldPaths:Object.keys(fields)},updateTransforms:transforms}]})});
  return r.status;
};
const S=v=>({stringValue:v});
const now=['consentAt','createdAt'].map(f=>({fieldPath:f,setToServerValue:'REQUEST_TIME'}));
const app=over=>({eventId:S('2026-10-ai-exchange'),reference:S('PA-2026-ZZZZ'),
  companyName:S('Live rules check'),contactName:S('Nobody'),email:S('check@example.com'),
  phone:S('+639170000099'),status:S('new'),...over});

T('a partner application with a landline is refused',
  await commit('paaipe_partner_applications','liverules-a',app({phone:S('02 8123 4567')}),now)===403,'expected 403');
T('a partner application that arrives pre-ACCEPTED is refused',
  await commit('paaipe_partner_applications','liverules-b',app({status:S('accepted')}),now)===403,'expected 403');
T('a registration without consent is refused',
  await commit('paaipe_event_registrations','liverules-c',
    {event:S('x'),full_name:S('Nobody'),email:S('c@example.com'),consent:{booleanValue:false}},
    [{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}])===403,'expected 403');
T('a visitor may not write an event',
  await commit('paaipe_events','liverules-d',{title:S('x'),slug:S('x'),status:S('published')},[])===403,'expected 403');
T('a visitor may not write an organization',
  await commit('paaipe_organizations','liverules-e',{name:S('x'),status:S('active')},[])===403,'expected 403');

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail?1:0);
