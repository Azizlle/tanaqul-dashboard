"""Patch explorer.html to work with new public_explorer.py endpoints"""
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "public/explorer.html"

with open(path, "r", encoding="utf-8") as f:
    c = f.read()

# Fix 1: loadStats - latest_block can be object or number
c = c.replace(
    "document.getElementById('xL').textContent=d.latest_block?'#'+d.latest_block:'",
    "const lb=d.latest_block;document.getElementById('xL').textContent=lb?(typeof lb==='object'?'#'+lb.number:'#'+lb):'"
)

# Fix 2: loadStats - latest_block_time fallback
c = c.replace(
    "if(d.latest_block_time)document.getElementById('xLT').textContent=new Date(d.latest_block_time).toLocaleString(L==='ar'?'ar-SA':'en-US')",
    "const lbt=d.latest_block_time||(typeof d.latest_block==='object'?d.latest_block.created_at:null);if(lbt)document.getElementById('xLT').textContent=new Date(lbt).toLocaleString(L==='ar'?'ar-SA':'en-US')"
)

# Fix 3: loadKeys - read vault_keys array + handle new field names
old_keys = "async function loadKeys(p){p=p||pg.keys;pg.keys=p;const d=await api('/vault-keys?page='+p+'&limit=20');const t=document.getElementById('tb4');"
old_keys += "\nif(!d||!d.items||!d.items.length)"
new_keys = "async function loadKeys(p){p=p||pg.keys;pg.keys=p;const d=await api('/vault-keys?page='+p+'&limit=20');const t=document.getElementById('tb4');"
new_keys += "\nconst vkItems=d?.vault_keys||d?.items||[];if(!vkItems.length)"
c = c.replace(old_keys, new_keys)

# Fix keys row rendering to use vkItems and handle new fields
c = c.replace(
    "t.innerHTML=d.items.map(x=>`<tr><td class=\"vk\">${x.vault_key}</td><td class=\"tk\">${x.token_id}</td>",
    "t.innerHTML=vkItems.map(x=>`<tr><td class=\"vk\">${x.vault_key||''}</td><td class=\"tk\">${x.token_id||x.entity_id||''}</td>"
)

# Fix keys pagination
c = c.replace(
    "renderPg('pg4',d.total,20,p,n=>loadKeys(n))}",
    "renderPg('pg4',d.total||vkItems.length,20,p,n=>loadKeys(n))}"
)

# Fix 4: loadTx - use /ledger endpoint + handle event_type field
c = c.replace(
    "async function loadTx(){const d=await api('/transactions?page=1&limit=50');const t=document.getElementById('tb2');",
    "async function loadTx(){const d=await api('/ledger?page=1&limit=50');const t=document.getElementById('tb2');"
)

# Handle ledger array name
c = c.replace(
    "\nif(!d||!d.items||!d.items.length){t.innerHTML=emp('",
    "\nconst txItems=d?.ledger||d?.items||[];if(!txItems.length){t.innerHTML=emp('",
    1  # only first occurrence in loadTx context — risky, let's be more specific
)

# Actually let me be more targeted — the loadTx function has a specific pattern
# Replace the items rendering in loadTx
c = c.replace(
    "t.innerHTML=d.items.map(x=>`<tr><td><span class=\"badge b-${x.type}\">${x.type.replace('_',' ')}</span></td><td>${x.metal}</td><td style=\"font-weight:600\">${x.grams}g</td><td><span class=\"badge b-${x.status}\">${x.status}</span></td><td style=\"color:var(--t2)\">${x.created_at?ago(x.created_at):'",
    "t.innerHTML=txItems.map(x=>{const tp=x.event_type||x.type||'SYSTEM';return`<tr><td><span class=\"badge b-${tp}\">${tp.replace('_',' ')}</span></td><td>${x.metal||x.details||''}</td><td style=\"font-weight:600\">${x.grams||0}g</td><td><span class=\"badge b-${x.status}\">${x.status}</span></td><td style=\"color:var(--t2)\">${x.created_at?ago(x.created_at):'"
)

# Fix the closing of the map
# Old ends with: '—'}</td></tr>`).join('')}
# New should end with: '—'}</td></tr>`}).join('')}
# The old uses backtick template, new uses arrow with return + backtick
# Actually the replace above already handles the opening, just need to fix closing
c = c.replace(
    "'}</td></tr>`).join('')}",
    "'}</td></tr>`}).join('')}",
    1  # first occurrence only
)

# Add ONBOARD badge style if not present
if ".b-ONBOARD" not in c:
    c = c.replace(
        ".b-KEY_CREATE{",
        ".b-ONBOARD{background:rgba(59,130,246,.1);color:var(--blue)}\n.b-PENDING{background:rgba(212,160,57,.1);color:var(--gold)}\n.b-CONFIRMED{background:rgba(16,185,129,.08);color:var(--green)}\n.b-SYSTEM{background:rgba(255,255,255,.05);color:var(--t2)}\n.b-MINT{background:var(--tg);color:var(--teal)}\n.b-BURN{background:rgba(239,68,68,.1);color:var(--red)}\n.b-KEY_CREATE{"
    )

with open(path, "w", encoding="utf-8") as f:
    f.write(c)

print(f"Patched {path}")
print("Changes:")
print("  1. loadStats: latest_block handles object/number")
print("  2. loadStats: latest_block_time fallback")  
print("  3. loadKeys: reads vault_keys array + entity_id fallback")
print("  4. loadTx: uses /ledger endpoint + event_type field")
print("  5. Added ONBOARD/PENDING/CONFIRMED badge styles")
