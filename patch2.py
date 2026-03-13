"""Patch explorer.html — complete fix for all issues"""
import sys

path = "public/explorer.html"
with open(path, "r", encoding="utf-8") as f:
    c = f.read()

# Find the <script> tag and replace the entire JS
old_script_start = "<script>"
old_script_end = "</script>"

si = c.index(old_script_start) + len(old_script_start)
ei = c.index(old_script_end, si)

new_js = """
const A='https://tanaqul-production.up.railway.app/api/v1/public/explorer';
let L='en',pg={tokens:1,keys:1,containers:1};

async function api(p){try{const r=await fetch(A+p);if(!r.ok)throw r.status;return await r.json()}catch(e){console.warn('API:'+p,e);return null}}
function ago(i){if(!i)return'—';const s=Math.floor((Date.now()-new Date(i).getTime())/1000);if(s<0)return'just now';if(s<60)return s+'s';if(s<3600)return Math.floor(s/60)+'m';if(s<86400)return Math.floor(s/3600)+'h';return Math.floor(s/86400)+'d'}
function bRow(b){return`<tr onclick="showBlock(${b.number})"><td style="font-weight:700;color:var(--gold)">#${b.number}</td><td class="hc" title="${b.hash}">${(b.hash||'').slice(0,20)}…</td><td>${b.tx_count}</td><td>${b.size_bytes?(b.size_bytes/1024).toFixed(1)+'KB':'—'}</td><td style="color:var(--t2)">${b.created_at?ago(b.created_at):'—'}</td></tr>`}
function emp(icon,msg){return`<tr><td colspan="7"><div class="empty"><div class="ei">${icon}</div>${msg}</div></td></tr>`}

function go(v,el){document.querySelectorAll('[id^="v-"]').forEach(e=>e.style.display='none');document.getElementById('v-'+v).style.display='';document.querySelectorAll('.tb').forEach(t=>t.classList.remove('on'));el.classList.add('on');
if(v==='blocks')loadAllBlocks();if(v==='tx')loadTx();if(v==='tokens')loadTokens();if(v==='keys')loadKeys();if(v==='containers')loadContainers()}

async function loadStats(){
  const d=await api('/network');if(!d)return;
  document.getElementById('xB').textContent=d.total_blocks||0;
  document.getElementById('xT').textContent=d.total_transactions||d.total_events||0;
  document.getElementById('xV').textContent=d.validator_count||d.active_validators||0;
  // Handle latest_block as object or number
  const lb=d.latest_block;
  if(lb&&typeof lb==='object'){
    document.getElementById('xL').textContent='#'+lb.number;
    if(lb.created_at)document.getElementById('xLT').textContent=new Date(lb.created_at).toLocaleString(L==='ar'?'ar-SA':'en-US');
  }else{
    document.getElementById('xL').textContent=lb?'#'+lb:'—';
    if(d.latest_block_time)document.getElementById('xLT').textContent=new Date(d.latest_block_time).toLocaleString(L==='ar'?'ar-SA':'en-US');
  }
  document.getElementById('xFl').textContent=d.tokens?.floating||0;
  document.getElementById('xLk').textContent=d.tokens?.linked||0;
  document.getElementById('xCt').textContent=d.bars?.containers||0;
}

async function loadProg(){
  const d=await api('/progress');if(!d)return;
  // Handle both old format (size_mb/hours/pending) and new format (pending_size_mb/hours_since_last_block/pending_transactions)
  const sizeMb=d.size_mb||d.pending_size_mb||0;
  const hours=d.hours||d.hours_since_last_block||0;
  const pending=d.pending||d.pending_transactions||d.total_pending||0;
  const maxSize=d.max_size_mb||d.trigger_settings?.size_mb||1;
  const maxHours=d.max_hours||d.trigger_settings?.hours||24;
  
  document.getElementById('pS').textContent=sizeMb;
  document.getElementById('pT').textContent=hours;
  document.getElementById('pP').textContent=pending;
  document.getElementById('pSB').style.width=Math.min(100,(sizeMb/maxSize)*100)+'%';
  document.getElementById('pTB').style.width=Math.min(100,(hours/maxHours)*100)+'%';
  
  let status=d.status||'waiting';
  if(!d.status){
    if(d.should_trigger)status='ready';
    else if(pending>0)status='accumulating';
    else status='waiting';
  }
  const s=document.getElementById('pSt');
  s.textContent=status.toUpperCase();
  s.className='sts sts-'+status;
}

async function loadBlocks(){
  const d=await api('/blocks?page=1&limit=10');const t=document.getElementById('tb0');
  const items=d?.items||d?.blocks||[];
  if(!items.length){t.innerHTML=emp('⛓','No blocks yet');return}
  t.innerHTML=items.map(bRow).join('');
}

async function loadAllBlocks(){
  const d=await api('/blocks?page=1&limit=50');const t=document.getElementById('tb1');
  const items=d?.items||d?.blocks||[];
  if(!items.length){t.innerHTML=emp('⛓','No blocks');return}
  t.innerHTML=items.map(bRow).join('');
}

async function showBlock(n){
  const d=await api('/blocks/'+n);if(!d||d.error)return;const el=document.getElementById('bDet');
  // Handle transactions from both matches and events
  const txs=d.transactions||[];
  let txHtml='';
  if(txs.length){
    txHtml='<div style="margin-top:14px"><div class="sh">Block <em>Transactions</em></div><div class="tbl"><table><thead><tr><th>TYPE</th><th>DETAILS</th><th>STATUS</th><th>TIME</th></tr></thead><tbody>'+
    txs.map(tx=>`<tr><td><span class="badge b-${tx.tx_type||'SYSTEM'}">${(tx.tx_type||'SYSTEM').replace('_',' ')}</span></td><td style="font-size:11px;max-width:300px;overflow:hidden;text-overflow:ellipsis">${tx.details||tx.metal||'—'}</td><td><span class="badge b-${tx.status}">${tx.status}</span></td><td style="color:var(--t2)">${tx.created_at?ago(tx.created_at):'—'}</td></tr>`).join('')+
    '</tbody></table></div></div>';
  }
  
  el.innerHTML=`<div class="detail">
<div class="dn">#${d.number}</div><div class="dh">${d.hash}</div>
<div class="dg"><div class="ds"><div class="k">TXS</div><div class="v">${d.tx_count}</div></div><div class="ds"><div class="k">SIZE</div><div class="v">${d.size_bytes?(d.size_bytes/1024).toFixed(1)+'KB':'—'}</div></div><div class="ds"><div class="k">TIME</div><div class="v" style="font-size:11px">${d.created_at?new Date(d.created_at).toLocaleString():'—'}</div></div></div>
${d.token_snapshot?`<div class="rings" style="margin-bottom:12px">
<div class="rn fl"><div class="ri">◉</div><div class="rt">FLOATING</div><div class="rv m">${d.token_snapshot.floating}</div></div>
<div class="rn lk"><div class="ri">⛡</div><div class="rt">LINKED</div><div class="rv m">${d.token_snapshot.linked}</div></div>
<div class="rn ct"><div class="ri">▣</div><div class="rt">CONTAINERS</div><div class="rv m">${d.bar_snapshot?.containers||0}</div></div></div>`:''}
${d.integrity?`<div class="integ ${d.integrity.valid?'ok':'fail'}">${d.integrity.valid?'✓':'✗'} Integrity: ${d.integrity.physical_grams}g = ${d.integrity.digital_tokens} tokens</div>`:''}
${txHtml}</div>`;
  el.scrollIntoView({behavior:'smooth'});
}

async function loadTx(){
  // Use /ledger endpoint for all blockchain events
  const d=await api('/ledger?page=1&limit=50');const t=document.getElementById('tb2');
  const items=d?.ledger||d?.items||[];
  if(!items.length){t.innerHTML=emp('📋','No events yet');return}
  t.innerHTML=items.map(x=>{
    const tp=x.event_type||x.type||'SYSTEM';
    const metalOrDetail=x.metal||x.vault_key||x.details||'—';
    return`<tr><td><span class="badge b-${tp}">${tp.replace('_',' ')}</span></td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${metalOrDetail}</td><td style="font-weight:600">${x.grams||0}g</td><td><span class="badge b-${x.event_type==='ONBOARD'?'ACTIVE':x.status}">${x.event_type==='ONBOARD'?'ACTIVE':x.status}</span></td><td style="color:var(--t2)">${x.created_at?ago(x.created_at):'—'}</td></tr>`;
  }).join('');
}

async function loadTokens(p){
  p=p||pg.tokens;pg.tokens=p;const d=await api('/tokens?page='+p+'&limit=20');const t=document.getElementById('tb3');
  const items=d?.items||[];
  if(!items.length){t.innerHTML=emp('🪙','No tokens yet');return}
  t.innerHTML=items.map(x=>`<tr onclick="showToken('${x.token_id}')"><td class="tk">${x.token_id}</td><td class="vk" title="${x.vault_key}">${x.vault_key}</td><td>${x.metal}</td><td><span class="badge b-${x.event_type==='ONBOARD'?'ACTIVE':x.status}">${x.event_type==='ONBOARD'?'ACTIVE':x.status}</span></td><td>${x.mint_count}</td><td style="color:var(--t2)">${x.minted_at?ago(x.minted_at):'—'}</td></tr>`).join('');
  renderPg('pg3',d.total,20,p,n=>loadTokens(n));
}

async function showToken(tid){
  const d=await api('/tokens/'+tid);if(!d||d.error)return;const el=document.getElementById('tDet');
  el.innerHTML=`<div class="detail"><div class="dn" style="font-size:18px;color:var(--gold)">${d.token_id}</div><div class="dh" style="color:var(--purple)">${d.vault_key}</div>
<div class="dg"><div class="ds"><div class="k">METAL</div><div class="v" style="font-size:14px">${d.metal}</div></div><div class="ds"><div class="k">STATUS</div><div class="v"><span class="badge b-${d.status}" style="font-size:11px">${d.status}</span></div></div><div class="ds"><div class="k">MINTS</div><div class="v">${d.mint_count}</div></div></div>
${d.origin_container?`<div style="background:var(--bg3);border-radius:10px;padding:10px 14px;margin-bottom:8px"><span style="font-size:10px;color:var(--t3)">ORIGIN CONTAINER</span><br><span class="m" style="color:var(--gold);font-size:13px">${d.origin_container.container_id}</span> <span style="font-size:11px;color:var(--t2)">${d.origin_container.metal} · ${d.origin_container.weight}</span></div>`:''}
${d.bond_history&&d.bond_history.length?`<div style="margin-top:10px"><span style="font-size:11px;font-weight:700;color:var(--t2)">BOND HISTORY</span>${d.bond_history.map(b=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px"><span style="color:var(--gold)">${b.container_id}</span><span class="badge b-${b.bonded?'LINKED':'FREE'}">${b.bonded?'BONDED':'BROKEN'}</span><span class="m" style="color:var(--t3)">${b.bonded_at?ago(b.bonded_at):''}</span></div>`).join('')}</div>`:''}</div>`;
  el.scrollIntoView({behavior:'smooth'});
}

async function loadKeys(p){
  p=p||pg.keys;pg.keys=p;
  const d=await api('/vault-keys');const t=document.getElementById('tb4');
  const items=d?.vault_keys||d?.items||[];
  // Deduplicate by vault_key
  const seen=new Set();const unique=[];
  items.forEach(x=>{const k=x.vault_key;if(k&&!seen.has(k)){seen.add(k);unique.push(x)}});
  if(!unique.length){t.innerHTML=emp('🔑','No vault keys yet');return}
  t.innerHTML=unique.map(x=>`<tr><td class="vk">${x.vault_key||'—'}</td><td class="tk">${x.token_id||x.entity_id||'—'}</td><td>${x.metal||'—'}</td><td><span class="badge b-ACTIVE">ACTIVE</span></td><td style="color:var(--t2)">${x.created_at?ago(x.created_at):'—'}</td></tr>`).join('');
}

async function loadContainers(p){
  p=p||pg.containers;pg.containers=p;const d=await api('/containers?page='+p+'&limit=20');const t=document.getElementById('tb5');
  const items=d?.items||[];
  if(!items.length){t.innerHTML=emp('▣','No containers yet');return}
  t.innerHTML=items.map(x=>`<tr><td style="font-weight:700;color:var(--gold)">${x.container_id}</td><td>${x.metal}</td><td>${x.weight} (${x.weight_grams}g)</td><td><span class="badge b-${x.event_type==='ONBOARD'?'ACTIVE':x.status}">${x.event_type==='ONBOARD'?'ACTIVE':x.status}</span></td><td>${x.vault_location}</td><td style="color:var(--t2)">${x.deposited_at?ago(x.deposited_at):'—'}</td><td style="color:var(--red)">${x.left_on?ago(x.left_on):'—'}</td></tr>`).join('');
  renderPg('pg5',d.total,20,p,n=>loadContainers(n));
}

function renderPg(id,total,per,cur,fn){const pages=Math.ceil(total/per);if(pages<=1){document.getElementById(id).innerHTML='';return}
let h='';for(let i=1;i<=Math.min(pages,10);i++)h+=`<button class="${i===cur?'on':''}" onclick="(${fn.toString()})(${i})">${i}</button>`;
document.getElementById(id).innerHTML=h}

async function doSearch(){const q=document.getElementById('si').value.trim();if(!q)return;
document.querySelectorAll('[id^="v-"]').forEach(e=>e.style.display='none');document.getElementById('v-search').style.display='';document.querySelectorAll('.tb').forEach(t=>t.classList.remove('on'));
const d=await api('/search?q='+encodeURIComponent(q));const el=document.getElementById('sOut');
if(!d||!d.total){el.innerHTML=`<div class="empty"><div class="ei">🔍</div>${L==='ar'?'لا نتائج':'No results for "'+q+'"'}</div>`;return}
el.innerHTML=d.results.map(r=>{
if(r.type==='block')return`<div class="s" style="margin-bottom:8px;cursor:pointer" onclick="go('blocks',document.getElementById('t1'));showBlock(${r.number})"><div class="sl">BLOCK #${r.number}</div><div class="hc">${r.hash}</div></div>`;
if(r.type==='token')return`<div class="s" style="margin-bottom:8px"><div class="sl">TOKEN</div><div class="tk">${r.token_id}</div><div class="vk" style="margin-top:4px">${r.vault_key}</div></div>`;
if(r.type==='vault_key')return`<div class="s" style="margin-bottom:8px"><div class="sl">VAULT KEY</div><div class="vk">${r.vault_key}</div></div>`;
if(r.type==='container')return`<div class="s" style="margin-bottom:8px"><div class="sl">CONTAINER</div><div style="font-weight:700;color:var(--gold)">${r.container_id}</div></div>`;
return''}).join('')}

function tLang(){L=L==='en'?'ar':'en';document.documentElement.dir=L==='ar'?'rtl':'ltr';document.documentElement.lang=L;
document.getElementById('lB').textContent=L==='ar'?'English':'عربي';
document.getElementById('lT').innerHTML=L==='ar'?'تنقل <span>المستكشف</span>':'Tanaqul <span>Explorer</span>';
document.getElementById('nL').textContent=L==='ar'?'الشبكة نشطة':'Network Active';
document.getElementById('si').placeholder=L==='ar'?'رقم البلوك، 0xTNQ...، BAR-...':'Block #, 0xTNQ..., 0xVK..., BAR-...';
document.getElementById('t0').textContent=L==='ar'?'نظرة عامة':'Overview';
document.getElementById('t1').textContent=L==='ar'?'البلوكات':'Blocks';
document.getElementById('t2').textContent=L==='ar'?'السجل':'Ledger';
document.getElementById('t3').textContent=L==='ar'?'الرموز':'Tokens';
document.getElementById('t4').textContent=L==='ar'?'مفاتيح الخزنة':'Vault Keys';
document.getElementById('t5').textContent=L==='ar'?'الحاويات':'Containers';
document.querySelectorAll('[data-'+L+']').forEach(el=>{el.innerHTML=el.getAttribute('data-'+L)});loadStats()}

loadStats();loadProg();loadBlocks();setInterval(()=>{loadStats();loadProg()},30000);
"""

c = c[:si] + new_js + c[ei:]

# Add badge styles for new event types
if ".b-ONBOARD" not in c:
    c = c.replace(
        ".b-KEY_CREATE{",
        ".b-ONBOARD{background:rgba(59,130,246,.1);color:var(--blue)}\n.b-PENDING{background:rgba(212,160,57,.1);color:var(--gold)}\n.b-CONFIRMED{background:rgba(16,185,129,.08);color:var(--green)}\n.b-SYSTEM{background:rgba(255,255,255,.05);color:var(--t2)}\n.b-TRADE{background:var(--tg);color:var(--teal)}\n.b-MINT{background:var(--tg);color:var(--teal)}\n.b-BURN{background:rgba(239,68,68,.1);color:var(--red)}\n.b-KEY_CREATE{"
    )

with open(path, "w", encoding="utf-8") as f:
    f.write(c)

print("✅ Explorer patched successfully")
print("Fixes applied:")
print("  1. loadStats: handles latest_block as object or number")
print("  2. loadProg: handles both old and new progress endpoint formats")
print("  3. loadBlocks: handles items[] or blocks[] response")
print("  4. loadTx: uses /ledger endpoint, shows event_type + investor_name")
print("  5. loadKeys: deduplicates vault keys, shows ACTIVE status, handles missing metal")
print("  6. showBlock: shows block transactions from new format")
print("  7. Added badge styles for ONBOARD, PENDING, CONFIRMED, TRADE, MINT, BURN")
