import assert from 'node:assert/strict';
const base=process.env.RADAR_TEST_URL||'http://127.0.0.1:5173';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw new Error('Smoke writes are allowed only on a local preview');
const prefix='QA smoke '+Date.now();
let passed=0;const created=[];
async function request(path,body,expected=200,headers={}){
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
  const raw=await response.text();let result;try{result=JSON.parse(raw);}catch{result={message:raw};}assert.equal(response.status,expected,JSON.stringify(result));return result;
}
function check(name,fn){fn();passed++;console.log('PASS',name);}
const before=await request('/api/radar');check('initialized persistent data',()=>{assert.ok(before.keywords.length>=6);assert.ok(before.sources.length>=5);assert.ok(before.sources.every(Boolean));});
for(const previous of before.keywords.filter(k=>k.keyword.startsWith('QA smoke ')&&k.notes.includes('__word_radar_smoke__'))){await request('/api/radar',{action:'update',id:previous.id,patch:{status:'rejected'}});}
let r=await request('/api/radar',{action:'add',keyword:prefix,market:'US',notes:'__word_radar_smoke__',url:'https://example.com'});check('manual creation',()=>assert.equal(r.added,1));
r=await request('/api/radar',{action:'add',keyword:prefix.toUpperCase(),market:'US'});check('case insensitive dedupe',()=>assert.equal(r.added,0));
let state=await request('/api/radar');const k=state.keywords.find(k=>k.keyword===prefix);created.push(k.id);check('unknown volume remains null',()=>assert.equal(k.volume,null));
await request('/api/radar',{action:'update',id:k.id,patch:{status:'watching',notes:'__word_radar_smoke__ saved'}});
state=await request('/api/radar');check('status and notes survive independent read',()=>{const saved=state.keywords.find(x=>x.id===k.id);assert.equal(saved.status,'watching');assert.match(saved.notes,/saved/);});
await request('/api/radar',{action:'update',id:k.id,patch:{kd:101}},400);passed++;console.log('PASS invalid metrics rejected');
await request('/api/radar',{action:'update',id:k.id,patch:{status:'approved'}},400);passed++;console.log('PASS approval requires rights review');
await request('/api/radar',{action:'update',id:k.id,patch:{status:'approved',review:{intent:true,gap:true,monetization:true,feasible:true,rights:true}}});passed++;console.log('PASS reviewed decision saved');
r=await request('/api/radar',{action:'derive',id:k.id,keyword:prefix+' derived'});check('signal extraction creates separate candidate',()=>assert.equal(r.added,1));
r=await request('/api/radar',{action:'import',csv:`keyword,volume,kd,cpc,market,notes\n${prefix},5000,25,2,US,do not overwrite\n${prefix} imported,,bad,,GB,__word_radar_smoke__\ninvalid,12,12,1,INVALID,`});check('CSV import, dedupe and invalid country',()=>{assert.equal(r.added,1);assert.equal(r.duplicates,1);assert.equal(r.skipped,1);});
state=await request('/api/radar');check('CSV duplicate preserves human work',()=>assert.match(state.keywords.find(x=>x.id===k.id).notes,/saved/));
check('CSV unknown is not zero',()=>{const imported=state.keywords.find(x=>x.keyword===prefix+' imported');assert.equal(imported.volume,null);assert.equal(imported.kd,null);assert.equal(imported.cpc,null);});
check('derived evidence provenance retained',()=>{const derived=state.keywords.find(x=>x.keyword===prefix+' derived');assert.equal(derived.evidence[0].url,'https://example.com/');assert.equal(derived.status,'validating');});
r=await request('/api/radar',{action:'bulk',ids:[k.id,state.keywords.find(x=>x.keyword===prefix+' derived').id],status:'watching'});check('bulk status update',()=>{assert.equal(r.updated,2);assert.equal(r.missing,0);});
await request('/api/radar',{action:'bulk',ids:[k.id],status:'approved'},400);passed++;console.log('PASS bulk approval blocked, rights review stays manual');
const backup=await request('/api/radar/backup');check('full backup exported',()=>{assert.equal(backup.app,'word-radar');assert.ok(backup.keywords.length>=state.keywords.length);assert.ok(Array.isArray(backup.runs));});
const tampered=JSON.parse(JSON.stringify(backup));for(const row of tampered.keywords){if(row.keyword.startsWith(prefix))row.notes='__word_radar_smoke__ attacker overwrite';}
r=await request('/api/radar/restore',{backup:tampered});check('restore merges without overwriting research',()=>{assert.equal(r.added,0);assert.equal(r.duplicates,backup.keywords.length);assert.equal(r.sourcesAdded,0);});
state=await request('/api/radar');check('restored duplicate keeps current notes',()=>{assert.doesNotMatch(state.keywords.find(x=>x.id===k.id).notes,/attacker overwrite/);});
const novel=JSON.parse(JSON.stringify(backup.keywords.find(x=>x.id===k.id)));novel.id='qa-restore-'+Date.now();novel.keyword=prefix+' restored';novel.status='new';
r=await request('/api/radar/restore',{backup:{app:'word-radar',version:1,keywords:[novel],sources:[]}});check('restore adds missing keywords with research intact',()=>assert.equal(r.added,1));
await request('/api/radar/restore',{backup:{app:'other',version:1,keywords:[],sources:[]}},400);passed++;console.log('PASS foreign backup file rejected');
if(!state.configured.serpapi){await request('/api/verify',{action:'compare',ids:[k.id,novel.id]},400);passed++;console.log('PASS compare without credential rejected');}
await request('/api/verify',{action:'compare',ids:[k.id],date:'7'},400);passed++;console.log('PASS compare requires at least two keywords');
await request('/api/radar',{action:'add',keyword:'bad origin'},403,{origin:'https://evil.example'});passed++;console.log('PASS cross-origin mutation rejected by framework');
await request('/api/radar',{action:'source',source:{id:'qa-invalid',name:'invalid',type:'sitemap',target:'https://127.0.0.1/sitemap.xml',enabled:true,market:'US'}},400);passed++;console.log('PASS local sitemap URL rejected');
await request('/api/scan',{sourceId:'trends'},400);passed++;console.log('PASS disabled data source rejected');
if(!state.configured.serpapi){await request('/api/verify',{id:k.id},400);passed++;console.log('PASS missing paid credential rejected');}
for(const row of state.keywords.filter(x=>x.keyword.startsWith(prefix))){await request('/api/radar',{action:'update',id:row.id,patch:{status:'rejected',notes:'__word_radar_smoke__ verified test record'}});if(!created.includes(row.id))created.push(row.id);}
console.log(JSON.stringify({passed,createdTestIds:created,cleanup:'All test records are marked rejected. Production is untouched.'}));
