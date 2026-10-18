import * as C from './core.js';
import * as Vault from './vault.js';
import {demoData} from './demo.js';
import {readFile,autoMap,mapTransactions} from './imports.js';
import {esc,icon,money,amountValue,dateLabel,monthLabel,option,button,empty,stat,chart} from './ui.js';

const app=document.querySelector('#app'), modal=document.querySelector('#modal');
let demo=new URLSearchParams(location.search).has('demo') || document.documentElement.dataset.preview==='true';
let session=null, envelope=null, view='dashboard', modalState={}, importState=null, importReview=[], categoryUpload=null;
let period=C.today().slice(0,7),budgetMode='month',budgetYear=C.today().slice(0,4),budgetMonth=C.today().slice(5,7),compareYear=String(+budgetYear-1);
let txSearch='',txCategory='',txFrom='',txTo='',txPage=0,saveQueue=Promise.resolve(),lastActivity=Date.now(),locking=false,authBusy=false,lockRequested=false;
const D=()=>session.data;
const currency=()=>D().settings.currency;
const cash=(v,digits=0,code=currency())=>money(v,code,digits);
const scopedTx=()=>D().transactions.filter(t=>(t.currency||'INR')===currency());
const categoryOptions=(selected,blank=false)=>`${blank?option('','All categories',selected):''}${D().categories.map(c=>option(c.id,c.name,selected)).join('')}`;
const subcategoryOptions=(selected='',blank='Choose a subcategory')=>option('',blank,selected)+D().categories.flatMap(c=>c.subs.map(s=>option(C.classificationValue(c.id,s),s+' · '+c.name,selected))).join('');
const selectedSubcategory=t=>C.resolveClassification(D().categories,C.classificationValue(t.categoryId,t.subcategory))?C.classificationValue(t.categoryId,t.subcategory):'';
const parentLabel=t=>selectedSubcategory(t)?categoryName(t.categoryId):'Choose a subcategory';
const currencyOptions=selected=>['INR','CHF','USD'].map(c=>option(c,c,selected)).join('');
const dimOptions=selected=>['date','month','year','category','subcategory','type','account'].map(d=>option(d,d[0].toUpperCase()+d.slice(1),selected)).join('');
const categoryName=id=>D().categories.find(c=>c.id===id)?.name||'Uncategorized';
const navItems=[['dashboard','Overview','grid'],['transactions','Transactions','rows'],['imports','Import statements','upload'],['categories','Categories','tag'],['reports','Charts & pivots','chart'],['budgets','Budgets','budget'],['timeline','Money Timeline','timeline']];
const viewLabels=Object.fromEntries([...navItems,['settings','Settings & security','settings']].map(v=>[v[0],v[1]]));
const field=(label,name,type='text',value='',extra='')=>`<label class="field">${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select=(label,name,options,extra='')=>`<label class="field">${esc(label)}<select name="${name}" ${extra}>${options}</select></label>`;
const head=(eyebrow,title,subtitle,actions='')=>`<div class="page-head"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="subtitle">${esc(subtitle)}</p></div><div class="actions">${actions}</div></div>`;
function toast(message){const t=document.querySelector('#toast');t.textContent=message;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),4500);}
async function mutate(callback,message='Saved to your encrypted vault') {
  const current=session;
  const task=saveQueue.then(async()=>{
    if(!current || current!==session)throw new Error('Unlock your vault to make this change.');
    const next=structuredClone(current.data);callback(next);
    if(!demo){const sealed=await Vault.encrypt(next,current.key,current.salt,current.iterations);await Vault.writeEnvelope(sealed);envelope=sealed;}
    current.data=next;
  });
  saveQueue=task.catch(()=>{});await task;if(message)toast(demo?'Preview updated · sample data only':message);
}
async function lock() {
  lockRequested=true;
  if(demo || locking)return;
  locking=true;await saveQueue;
  modal.close();modal.innerHTML='';importState=null;importReview=[];categoryUpload=null;modalState={};session=null;
  txSearch='';txCategory='';txFrom='';txTo='';renderAuth();locking=false;
}
function renderAuth() {
  const exists=!!envelope;
  app.innerHTML=`<main class="vault-screen"><section class="vault-art"><div class="brand"><div class="logo">${icon('leaf')}</div>Pocket Ledger</div><h1>A little clarity.<br>A lot more<br>possibility.</h1><p>A thoughtful home for your everyday money and the life you’re planning.</p><svg class="art-lines" viewBox="0 0 360 150"><path d="M0 130 Q70 130 110 95 T210 82 T360 10"/><path d="M0 145 Q70 145 110 110 T210 97 T360 25" opacity=".4"/><circle cx="210" cy="82" r="6" fill="#ccd7a8"/></svg><footer>YOUR DEVICE. YOUR DATA. YOUR PEACE OF MIND.</footer></section><section class="vault-form"><div><div class="lock-logo">${icon('lock')}</div><div class="eyebrow">A private space for your money</div><h2>${exists?'Welcome back.':'Make yourself at home.'}</h2><p class="subtitle">${exists?'Unlock your local ledger to pick up where you left off.':'Create a password to protect your personal ledger.'}</p><form id="auth-form">${field('Password','password','password','','required minlength="10" autocomplete="'+(exists?'current-password':'new-password')+'"')}${exists?'':field('Confirm password','confirm','password','','required minlength="10" autocomplete="new-password"')}<div class="form-error" role="alert"></div><button class="btn" type="submit">${icon('lock')}${exists?'Unlock my ledger':'Create encrypted ledger'}</button></form><div class="notice">${exists?'Your data stays on this device. Use your encrypted backup to move to another device.':'Use at least 10 characters. There is no password reset: keep your password and an encrypted backup somewhere safe.'}</div><button class="btn ghost" data-action="enter-demo">Explore with sample data ${icon('arrow')}</button><button class="btn ghost" data-action="restore-locked">Restore an encrypted backup</button><p class="footnote">AES-256-GCM encryption · No account · No cloud connection</p></div></section></main>`;
}
function render() {
  if(!session){renderAuth();return;}
  const name=viewLabels[view]||'Overview';
  app.innerHTML=`<div class="layout"><aside class="sidebar"><div class="brand"><div class="logo">${icon('leaf')}</div><span>Pocket Ledger</span></div><div class="nav-label">YOUR PERSONAL SPACE</div><nav class="nav" aria-label="Main navigation">${navItems.map(([id,label,glyph])=>`<button data-view="${id}" class="${view===id?'active':''}" title="${label}" ${view===id?'aria-current="page"':''}>${icon(glyph)}<span>${label}</span></button>`).join('')}</nav><div class="sidebar-bottom"><nav class="nav"><button data-view="settings" class="${view==='settings'?'active':''}" title="Settings & security">${icon('settings')}<span>Settings & security</span></button></nav><div class="local-note"><strong>${icon('lock')} ${demo?'Sample data preview':'Private by design'}</strong>${demo?'Try every screen. Changes in this preview are temporary.':'Encrypted on this device.<br>No cloud. Just you.'}</div><div class="profile"><div class="avatar">PL</div><div><strong>My personal ledger</strong><small>${demo?'Preview workspace':'Local workspace'}</small></div><button data-action="${demo?'exit-demo':'lock'}" aria-label="${demo?'Exit preview':'Lock vault'}">${icon('lock')}</button></div></div></aside><main class="main">${demo?'<div class="demo-banner"><span>DESIGN PREVIEW · Fictional family and sample transactions</span><button data-action="exit-demo">Use my own ledger →</button></div>':''}<header class="topbar"><div class="crumb"><button class="mobile-toggle" data-action="menu" aria-label="Open navigation">${icon('menu')}</button><span>My workspace</span><span>/</span><b>${name}</b></div><div class="top-actions"><span class="status">${demo?'Preview · not saved':'Encrypted locally'}</span><select id="currency-select" aria-label="Active currency">${currencyOptions(currency())}</select><button class="icon-btn" data-action="${demo?'exit-demo':'lock'}" aria-label="${demo?'Exit preview':'Lock vault'}">${icon('lock')}</button></div></header><div class="content">${({dashboard:renderDashboard,transactions:renderTransactions,imports:renderImports,categories:renderCategories,reports:renderReports,budgets:renderBudgets,timeline:renderTimeline,settings:renderSettings}[view]||renderDashboard)()}</div></main></div>`;
}
function transactionTable(transactions,compact=false) {
  if(!transactions.length)return empty('A fresh start','Add your first transaction or bring in a bank statement.','add-transaction','Add transaction','rows');
  return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Transaction</th><th>Main category</th>${compact?'':'<th>Subcategory</th><th>Account</th>'}<th class="numeric">Debit</th><th class="numeric">Final debit</th><th class="numeric">Credit</th>${compact?'':'<th></th>'}</tr></thead><tbody>${transactions.map((t,i)=>`<tr><td>${dateLabel(t.date,D().settings.dateFormat)}</td><td><div class="description">${compact?`<span class="category-symbol ${i%3===1?'alt':i%3===2?'purple':''}">${icon(({home:'home',food:'food',travel:'travel',family:'family',pay:'wallet'})[t.categoryId]||'tag')}</span>`:''}<div><strong>${esc(t.description)}</strong>${compact?`<br><small>${esc(t.subcategory||'Unassigned')}</small>`:''}</div></div></td><td><span class="tag ${i%3===1?'purple':i%3===2?'orange':''}">${esc(categoryName(t.categoryId))}</span></td>${compact?'':`<td>${esc(t.subcategory||'Unassigned')}</td><td>${esc(t.account||'—')}</td>`}<td class="numeric">${t.debit?cash(t.debit,2):'—'}</td><td class="numeric"><strong>${cash(C.finalDebit(t),2)}</strong></td><td class="numeric income">${t.credit?cash(t.credit,2):'—'}</td>${compact?'':`<td><button class="icon-btn" data-action="edit-transaction" data-id="${esc(t.id)}" aria-label="Edit ${esc(t.description)}">${icon('edit')}</button></td>`}</tr>`).join('')}</tbody></table></div>`;
}
function renderDashboard() {
  const ts=scopedTx().filter(t=>t.date.startsWith(period));
  const spent=ts.filter(t=>C.categoryRole(D(),t.categoryId)==='expense').reduce((s,t)=>s+C.finalDebit(t),0);
  const income=ts.filter(t=>C.categoryRole(D(),t.categoryId)==='income').reduce((s,t)=>s-C.finalDebit(t),0);
  const net=ts.reduce((s,t)=>s-C.finalDebit(t),0);
  const planned=D().categories.reduce((s,c)=>s+C.planned(D(),c.id,period),0);
  const expenseIds=D().categories.filter(c=>C.categoryRole(D(),c.id)==='expense').map(c=>c.id);
  const spending={name:'Spending rhythm',type:'bar',dimension:'month',measure:'final',from:period.slice(0,4)+'-01-01',to:period+'-31',categories:expenseIds};
  const breakdown={name:'Spending breakdown',type:'donut',dimension:'category',measure:'final',from:period+'-01',to:period+'-31',categories:expenseIds};
  return head('YOUR MONEY, IN PERSPECTIVE','A clearer picture of your money.',`Everyday spending. Thoughtful plans. All in one place.`,button('go-import','Import statement','upload','secondary')+button('add-transaction','Add transaction'))+`<div class="filters"><label>Overview for <input id="overview-period" type="month" value="${period}"></label><span class="hint">${currency()} only · currencies are kept separate</span></div><div class="grid cols4 stats">${stat('Net cash flow',cash(net),'Credits − debits − adjustments','wallet',true)}${stat('Income this month',cash(income),'Income and salary categories','down')}${stat('Expenses this month',cash(spent),'Expense categories, after adjustments','up')}${stat('Budget remaining',cash(planned-spent),planned?'Of '+cash(planned)+' planned':'Set a monthly budget to track progress','budget')}</div><div class="grid dashboard-charts"><section class="card"><div class="card-head"><div><h2>Your spending rhythm</h2><p>A little perspective on the year so far</p></div><span class="tag">${period.slice(0,4)}</span></div>${chart(D(),spending)}<div class="card-foot"><span>Final debit · expense categories</span><button class="inline-link" data-view="reports">Explore reports →</button></div></section><section class="card"><div class="card-head"><div><h2>Where it goes</h2><p>${monthLabel(period)} · by category</p></div>${icon('budget')}</div>${chart(D(),breakdown)}<div class="card-foot"><span>Small details. A bigger picture.</span></div></section></div><div class="grid lower-grid"><section class="card"><div class="card-head"><div><h2>Recent transactions</h2><p>The latest entries in your ledger</p></div><button class="inline-link" data-view="transactions">View all →</button></div><div style="height:17px"></div>${transactionTable([...ts].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4),true)}</section><section class="card"><div class="card-head"><div><h2>A little room to breathe</h2><p>Your monthly budget at a glance</p></div></div>${expenseIds.filter(id=>C.planned(D(),id,period)>0).slice(0,4).map(id=>{const plan=C.planned(D(),id,period),actual=C.actual(D(),id,period);return `<div class="budget-mini"><div class="mini-label"><strong>${esc(categoryName(id))}</strong><span>${cash(actual)} / ${cash(plan)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(0,actual/plan*100)}%;${actual>plan?'background:#c89b7c':''}"></div></div></div>`;}).join('')||empty('Make a little plan','Give each category a monthly allowance.','add-budget','Plan a budget','budget')}</section></div><p class="footnote">Your ${currency()} view · Final debit = debit − credit + adjustment. Transfers are included in cash flow and excluded from spending KPIs.</p>`;
}
function filteredTransactions(){return scopedTx().filter(t=>(!txSearch||[t.description,t.account,t.subcategory].join(' ').toLowerCase().includes(txSearch.toLowerCase()))&&(!txCategory||t.categoryId===txCategory)&&(!txFrom||t.date>=txFrom)&&(!txTo||t.date<=txTo)).sort((a,b)=>b.date.localeCompare(a.date));}
function renderTransactions() {
  const list=filteredTransactions();txPage=Math.min(txPage,Math.max(0,Math.ceil(list.length/30)-1));
  return head('THE EVERYDAY DETAILS','Your transactions','A ledger you can edit, organize, and make your own.',button('export-transactions','Export CSV','download','secondary')+button('add-transaction','Add transaction'))+`<div class="filters"><div class="search">${icon('search')}<input id="tx-search" placeholder="Search description, account…" value="${esc(txSearch)}" aria-label="Search transactions"></div><select id="tx-category" aria-label="Filter category">${categoryOptions(txCategory,true)}</select><label>From <input id="tx-from" type="date" value="${txFrom}"></label><label>To <input id="tx-to" type="date" value="${txTo}"></label></div><section class="card">${transactionTable(list.slice(txPage*30,(txPage+1)*30))}<div class="card-foot"><span>${list.length} transactions · ${currency()} · Total final debit ${cash(list.reduce((s,t)=>s+C.finalDebit(t),0),2)}</span><div class="actions">${button('tx-prev','Previous','','ghost small',txPage===0?'disabled':'')}<span>Page ${txPage+1} of ${Math.max(1,Math.ceil(list.length/30))}</span>${button('tx-next','Next','','ghost small',(txPage+1)*30>=list.length?'disabled':'')}</div></div></section><div class="notice">Choose a subcategory and its main category is assigned automatically. The amount columns are Debit → Final debit → Credit. Edit final debit to record an adjustment while keeping the original debit and credit. Negative final debit represents money received.</div>`;
}
function renderCategories() {
  return head('A PLACE FOR EVERYTHING','Categories, your way','Make room for the things that matter — and all the little things, too.',button('import-categories','Upload categories','upload','secondary')+button('add-category','New category'))+`<section class="card pad"><div class="actions" style="justify-content:space-between"><div><h3>Transaction types</h3><p class="hint" style="margin-top:5px">Custom names, with an expense, income or transfer role for accurate KPIs.</p></div>${button('add-type','Add type','plus','secondary small')}</div><div class="chips">${D().types.map(t=>`<button class="tag" data-action="edit-type" data-id="${esc(t.id)}">${esc(t.name)} <span class="muted">· ${esc(t.role)}</span> ${icon('edit')}</button>`).join('')}</div></section><div class="section-title"><h2>Your categories <span class="tag">${D().categories.length}</span></h2><button class="inline-link" data-action="category-template">Download upload template</button></div><div class="grid category-grid">${D().categories.map((c,i)=>`<section class="card category-card"><div class="category-top"><span class="category-symbol ${i%3===1?'alt':i%3===2?'purple':''}">${icon(({home:'home',food:'food',travel:'travel',family:'family',pay:'wallet'})[c.id]||'tag')}</span><div><h3>${esc(c.name)}</h3><small>${esc(D().types.find(t=>t.id===c.typeId)?.name)}</small></div><button class="icon-btn" data-action="edit-category" data-id="${esc(c.id)}" aria-label="Edit ${esc(c.name)}">${icon('edit')}</button></div><div class="chips">${c.subs.map(s=>`<span class="tag">${esc(s)}</span>`).join('')||'<span class="hint">No subcategories yet</span>'}</div><div class="category-bottom"><span>${scopedTx().filter(t=>t.categoryId===c.id).length} transactions · ${currency()}</span><button class="inline-link" data-action="edit-category" data-id="${esc(c.id)}">Manage →</button></div></section>`).join('')}</div>`;
}
function renderReports() {
  const reports=D().reports.filter(r=>(r.currency||'INR')===currency());
  return head('SEE IT YOUR WAY','Insights that fit your life','Create as many charts and pivots as you need. Every view is editable.',button('add-report','Create a report'))+`<div class="grid report-grid">${reports.map(r=>`<section class="card report-card ${r.type==='pivot'?'pivot':''}"><div class="card-head"><div><h2>${esc(r.name)}</h2><p>${({bar:'Bar chart',line:'Line chart',donut:'Donut chart',pivot:'Pivot table'})[r.type]} · ${esc(r.dimension)}${r.column?' × '+esc(r.column):''}</p></div><div class="actions"><button class="icon-btn" data-action="export-report" data-id="${esc(r.id)}" aria-label="Export ${esc(r.name)}">${icon('download')}</button><button class="icon-btn" data-action="edit-report" data-id="${esc(r.id)}" aria-label="Edit ${esc(r.name)}">${icon('edit')}</button></div></div>${chart(D(),r)}<div class="card-foot"><span>${esc(({final:'Final debit',debit:'Debit',credit:'Credit',count:'Transaction count'})[r.measure])} · ${r.from?dateLabel(r.from):'All dates'} — ${r.to?dateLabel(r.to):'today and beyond'} · ${currency()}</span><button class="inline-link" data-action="copy-report" data-id="${esc(r.id)}">Duplicate</button></div></section>`).join('')||`<section class="card">${empty('Your data, your perspective','Start with a line chart, bar chart, donut or fully configurable pivot.','add-report','Create a report','chart')}</section>`}</div><p class="footnote">Choose any category combination, date range, amount and grouping. Edit the source transactions and every saved report updates automatically.</p>`;
}
function renderBudgets() {
  const p=budgetYear+(budgetMode==='month'?'-'+budgetMonth:''),prev=compareYear+(budgetMode==='month'?'-'+budgetMonth:'');
  const cats=D().categories.filter(c=>C.categoryRole(D(),c.id)==='expense');
  const totalPlan=cats.reduce((s,c)=>s+C.planned(D(),c.id,p),0),totalActual=C.actual(D(),'',p),previous=C.actual(D(),'',prev);
  const entries=D().budgets.filter(b=>(b.currency||'INR')===currency()&&(budgetMode==='year'?b.period.startsWith(budgetYear):b.period===p));
  return head('INTENTION MEETS EVERYDAY','Make a little plan.','Monthly detail, yearly perspective, and room to learn from the past.',button('export-budget','Export comparison','download','secondary')+button('add-budget','Plan a budget'))+`<div class="filters"><div class="segmented"><button data-action="budget-month" class="${budgetMode==='month'?'selected':''}">Monthly</button><button data-action="budget-year" class="${budgetMode==='year'?'selected':''}">Yearly</button></div><label>Year <input id="budget-year" type="number" min="1900" max="2200" value="${budgetYear}" style="width:90px"></label>${budgetMode==='month'?`<select id="budget-month" aria-label="Budget month">${Array.from({length:12},(_,i)=>option(String(i+1).padStart(2,'0'),new Date(2025,i,1).toLocaleDateString('en-GB',{month:'long'}),budgetMonth)).join('')}</select>`:''}<label>Compare with <input id="compare-year" type="number" min="1900" max="2200" value="${compareYear}" style="width:90px"></label></div><div class="grid cols4 stats">${stat('Planned',cash(totalPlan),budgetMode==='year'?'Annual plans + monthly plans':'Monthly plans only','budget',true)}${stat('Actual spending',cash(totalActual),'From finalized expense transactions','wallet')}${stat('Remaining',cash(totalPlan-totalActual),totalActual>totalPlan?'Above the planned amount':'Space within your plan','leaf')}${stat('Previous actual',cash(previous),prev.length===4?prev:monthLabel(prev),'clock')}</div><section class="card"><div class="card-head"><div><h2>${p.length===4?p:monthLabel(p)} <span class="tag">${currency()}</span></h2><p>A side-by-side view of where you planned to be and where you are.</p></div></div><div style="height:18px"></div><div class="table-wrap"><table><thead><tr><th>Category</th><th class="numeric">${budgetYear} planned</th><th class="numeric">${budgetYear} actual</th><th class="numeric">Remaining</th><th>Progress</th><th class="numeric">${compareYear} planned</th><th class="numeric">${compareYear} actual</th><th class="numeric">Actual change</th></tr></thead><tbody>${cats.map(c=>{const plan=C.planned(D(),c.id,p),actual=C.actual(D(),c.id,p),pp=C.planned(D(),c.id,prev),pa=C.actual(D(),c.id,prev);return `<tr><td><strong>${esc(c.name)}</strong></td><td class="numeric">${cash(plan)}</td><td class="numeric">${cash(actual)}</td><td class="numeric ${actual>plan?'':'income'}">${cash(plan-actual)}</td><td class="budget-progress"><small>${plan?Math.round(actual/plan*100)+'% used':'No plan'}</small><div class="bar-track"><div class="bar-fill" style="width:${plan?Math.max(0,actual/plan*100):0}%;${actual>plan?'background:#c89b7c':''}"></div></div></td><td class="numeric">${cash(pp)}</td><td class="numeric">${cash(pa)}</td><td class="numeric">${cash(actual-pa)}</td></tr>`;}).join('')}</tbody></table></div></section><div class="section-title"><h2>Saved budget plans</h2><span class="hint">${entries.length} plans in this view</span></div><section class="card">${entries.length?`<div class="table-wrap"><table><thead><tr><th>Category</th><th>Period</th><th class="numeric">Planned amount</th><th></th></tr></thead><tbody>${entries.map(b=>`<tr><td>${esc(categoryName(b.categoryId))}</td><td>${b.period.length===4?b.period+' · annual plan':monthLabel(b.period)}</td><td class="numeric">${cash(b.amount)}</td><td class="numeric"><button class="icon-btn" data-action="edit-budget" data-id="${esc(b.id)}" aria-label="Edit budget">${icon('edit')}</button></td></tr>`).join('')}</tbody></table></div>`:empty('A plan starts here','Set an annual total or individual monthly amounts for each category.','add-budget','Plan a budget','budget')}</section><p class="footnote">Annual plans appear in the yearly view. Monthly plans add up in the yearly view. To prevent double counting, each category and currency uses either an annual plan or monthly plans within a given year.</p>`;
}
function renderTimeline() {
  const milestones=D().milestones.filter(m=>(m.currency||'INR')===currency()).sort((a,b)=>a.date.localeCompare(b.date));
  return head('FOR THE LIFE AHEAD','Money Timeline','Connect your money to your family’s next chapters.',button('export-timeline','Export timeline','download','secondary')+button('add-milestone','Add milestone'))+`<div class="family-grid">${D().family.map((f,i)=>`<button class="family-member" data-action="edit-family" data-id="${esc(f.id)}"><div class="avatar">${esc(f.name.slice(0,2).toUpperCase())}</div><div><b>${esc(f.name)}</b><small>${C.ageOn(f.birthDate,C.today())} years today · ${dateLabel(f.birthDate)}</small></div></button>`).join('')}<button class="family-member add" data-action="add-family">${icon('plus')} Add family member</button></div><section class="timeline-intro"><div><div class="eyebrow">YOUR FUTURE, WITH A LITTLE FORESIGHT</div><h2>Big moments begin with small plans.</h2><p>Set a date, plan an amount, and see everyone’s age at each milestone. Adjust savings and return assumptions as life changes.</p></div><div><small>Planned milestones · ${currency()}</small><div class="big">${milestones.length} chapters ahead</div><p>Projections from ${dateLabel(C.today())}</p></div></section><div class="timeline-cards">${milestones.map(m=>{const p=C.projection(m);return `<section class="card milestone"><div class="milestone-date"><span>${new Date(m.date+'T12:00:00').toLocaleDateString('en-GB',{month:'short',year:'numeric'}).toUpperCase()}</span><button class="icon-btn" data-action="edit-milestone" data-id="${esc(m.id)}" aria-label="Edit ${esc(m.name)}">${icon('edit')}</button></div><h3>${esc(m.name)}</h3><p class="hint">${esc(m.notes||'A milestone worth planning for')}</p><div class="amount">${cash(p.required)}</div><small>Target at milestone date · ${currency()}</small><div class="row"><span>Projected savings</span><strong>${cash(p.projected)}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${p.required?Math.max(0,p.projected/p.required*100):100}%"></div></div><div class="row"><span>Monthly contribution</span><strong>${cash(m.monthly)}</strong></div><div class="row"><span>${p.gap?'Projected shortfall':'Projection status'}</span><strong>${p.gap?cash(p.gap):'Target covered'}</strong></div><div class="age-chips">${D().family.map(f=>`<span class="tag">${esc(f.name)} · ${C.ageOn(f.birthDate,m.date)}</span>`).join('')}</div></section>`;}).join('')||`<section class="card">${empty('What are you looking forward to?','Add your family and a dated goal to see the years ahead.','add-milestone','Add milestone','timeline')}</section>`}</div><div class="section-title"><h2>Your timeline, at a glance</h2><span class="tag">Dates · months · years</span></div><section class="card"><div class="table-wrap"><table><thead><tr><th>Milestone</th><th>Date</th><th>Month</th><th>Year</th>${D().family.map(f=>`<th>${esc(f.name)}’s age</th>`).join('')}<th class="numeric">Future target</th><th class="numeric">Projected savings</th><th class="numeric">Shortfall</th></tr></thead><tbody>${milestones.map(m=>{const p=C.projection(m);return `<tr><td><strong>${esc(m.name)}</strong></td><td>${dateLabel(m.date)}</td><td>${m.date.slice(5,7)}</td><td>${m.date.slice(0,4)}</td>${D().family.map(f=>`<td>${C.ageOn(f.birthDate,m.date)}</td>`).join('')}<td class="numeric">${cash(p.required)}</td><td class="numeric">${cash(p.projected)}</td><td class="numeric">${cash(p.gap)}</td></tr>`;}).join('')||'<tr><td>No milestones yet.</td></tr>'}</tbody></table></div></section><div class="notice">Planning estimates, based on your inputs: annual effective growth compounded monthly, contributions at month-end, and annual inflation on today’s target. Taxes and fees are excluded. These are assumptions, not guaranteed returns.</div>`;
}
function renderSettings() {
  return head('YOUR SPACE, YOUR RULES','Settings & security','A private ledger, made to feel like yours.')+`<div class="grid settings-grid"><section class="card settings-card"><h2>Preferences</h2><p>Switch currency views without converting or mixing balances.</p><form id="preferences-form"><div class="form-grid">${select('Default currency view','currency',currencyOptions(currency()))}${select('Date format','dateFormat',option('DMY','Day / month / year',D().settings.dateFormat)+option('MDY','Month / day / year',D().settings.dateFormat))}${select('Lock after inactivity','autoLock',[1,2,5,10,15].map(v=>option(v,v+' minutes',D().settings.autoLock)).join(''))}</div><button class="btn" type="submit" style="margin-top:20px">Save preferences</button></form><div class="notice">INR, CHF and USD are supported. Each transaction, budget and milestone has its own currency. No automatic foreign-exchange conversion is applied.</div></section><section class="card settings-card"><h2>A lock only you can open</h2><p>Your password protects an AES-256-GCM encrypted vault stored on this device.</p><div class="settings-row"><div><strong>App password</strong><small>Minimum 10 characters</small></div>${button('change-password','Change password','lock','secondary small')}</div><div class="settings-row"><div><strong>Automatic protection</strong><small>Locks when backgrounded and after inactivity</small></div><span class="tag">Enabled</span></div><div class="settings-row"><div><strong>Cloud sync</strong><small>All financial data stays local</small></div><span class="tag">No cloud</span></div></section><section class="card settings-card"><h2>Back up your peace of mind</h2><p>Save an encrypted backup outside the app. You will need the password used when that backup was created.</p><div class="actions">${button('backup','Encrypted backup','download')}${button('restore','Restore backup','upload','secondary')}</div><p class="footnote">Uninstalling the app or clearing its data removes the local vault. There is no password recovery service. Restore replaces the current ledger after a review.</p></section><section class="card settings-card"><h2>Take your data with you</h2><p>Export your full transaction table with date, month, year, currency, categories and all amount columns.</p>${button('export-all','Export all transactions','download','secondary')}<div class="notice warning">CSV exports are readable files. Keep them somewhere private. Encrypted backups remain password protected.</div></section></div>`;
}
function renderImports() {
  const stage=importReview.length?3:importState?2:1;
  const steps=`<div class="steps">${['Choose a statement','Match the columns','Review & finalize'].map((s,i)=>`<div class="step ${stage===i+1?'active':''}"><span>${i+1}</span>${s}</div>`).join('')}</div>`;
  const title=head('A SIMPLE WAY TO BEGIN','Bring your money into focus.','Import a statement, check the details, and make it part of your ledger.',stage>1?button('reset-import','Start over','upload','secondary'):'');
  if(stage===1)return title+steps+`<div class="grid import-layout"><section class="card"><div class="card-head"><div><h2>Your statements, organized</h2><p>Everything is processed locally on this device.</p></div></div><div class="drop-zone" id="drop-zone"><div class="upload-icon">${icon('upload')}</div><h2>Choose a bank statement</h2><p>CSV, Excel (.xlsx), or a PDF with selectable text · up to 20 MB</p><label class="btn">${icon('upload')} Browse files<input id="statement-file" type="file" accept=".csv,.tsv,.txt,.xlsx,.pdf" hidden style="display:none"></label><div class="file-types"><span class="tag">CSV</span><span class="tag purple">XLSX</span><span class="tag orange">PDF</span></div></div><div style="padding:0 23px 23px"><label class="field">PDF password, if protected<input id="pdf-password" type="password" autocomplete="off" placeholder="Optional · never saved"></label><p class="hint" style="margin-top:12px">Older .xls files: save as .xlsx first. Scanned PDFs need OCR or a CSV/Excel export from your bank.</p></div><div class="card-foot"><span>Nothing is saved until you finalize the review.</span><button class="inline-link" data-action="statement-template">Try a sample CSV</button></div></section><aside class="card import-info"><span class="tag">YOU STAY IN CONTROL</span><h2 style="margin-top:18px">A few thoughtful checks.</h2><ol><li><strong>Choose the right columns.</strong><br>Match your bank’s date, description, debit and credit fields.</li><li><strong>Make it yours.</strong><br>Correct descriptions, assign subcategories and adjust amounts in the review table.</li><li><strong>Bring in only what you need.</strong><br>Exclude balances, summaries and duplicate rows before saving.</li></ol><div class="notice">Amounts use a decimal point. Commas are treated as thousands separators. Check your bank’s format during review.</div></aside></div>${D().imports.length?`<div class="section-title"><h2>Import history</h2></div><section class="card"><div class="table-wrap"><table><thead><tr><th>Statement</th><th>Imported</th><th>Transactions</th><th>Currency</th></tr></thead><tbody>${[...D().imports].reverse().map(i=>`<tr><td>${esc(i.name)}</td><td>${dateLabel(i.date)}</td><td>${i.count}</td><td>${esc(i.currency)}</td></tr>`).join('')}</tbody></table></div></section>`:''}`;
  if(stage===2) {
    const sheet=importState.sheets[importState.sheetIndex||0],headerIndex=importState.headerIndex||0,headers=sheet.rows[headerIndex]||[],mapping=autoMap(headers);
    return title+steps+`<section class="card pad"><div class="actions" style="justify-content:space-between"><div><h2>${esc(importState.name)}</h2><p class="hint">${sheet.rows.length} extracted rows. Select the row containing the column names.</p></div><span class="tag">${importState.kind.toUpperCase()}</span></div><div class="filters" style="margin-top:20px"><label>Worksheet <select id="import-sheet">${importState.sheets.map((s,i)=>option(i,s.name,importState.sheetIndex||0)).join('')}</select></label><label>Header row <input id="header-row" type="number" min="1" max="${sheet.rows.length}" value="${headerIndex+1}" style="width:80px"></label></div>${importState.kind==='pdf'?`<div class="notice warning">PDF layouts vary. The extracted text below is editable: use tabs between columns and one transaction per line. Verify empty debit/credit cells, wrapped descriptions and totals against the original.</div><label class="field">Extracted PDF text (tab-separated)<textarea id="pdf-raw" class="raw-text">${esc(importState.raw)}</textarea></label>${button('apply-pdf-text','Apply text corrections','check','secondary small','style="margin-top:10px"')}`:''}<div class="table-wrap" style="max-height:210px;margin-top:18px"><table><thead><tr>${headers.map((h,i)=>`<th>${i+1} · ${esc(h)}</th>`).join('')}</tr></thead><tbody>${sheet.rows.slice(headerIndex+1,headerIndex+5).map(row=>`<tr>${headers.map((_,i)=>`<td>${esc(row[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><form id="map-form"><div class="grid mapping-grid">${Object.entries({date:'Date *',description:'Description *',debit:'Debit',final:'Final debit (optional)',credit:'Credit',amount:'Signed amount (alternative)',category:'Main category (optional hint)',subcategory:'Subcategory (optional)',account:'Account (optional)'}).map(([key,label])=>select(label,key,option(-1,'Not mapped',mapping[key])+headers.map((h,i)=>option(i,String(h)||'Column '+(i+1),mapping[key])).join(''))).join('')}${select('Statement date format','dateFormat',option('DMY','Day / month / year',D().settings.dateFormat)+option('MDY','Month / day / year',D().settings.dateFormat))}${select('Signed amount convention','signedMode',option('negative-debit','Negative = debit','negative-debit')+option('positive-debit','Positive = debit'))}${select('Default subcategory (optional)','defaultSubcategory',subcategoryOptions('','Assign each row during review'))}${select('Statement currency','currency',currencyOptions(currency()))}${field('Default account','accountName','text','','placeholder="e.g. HDFC Savings / UBS / Chase"')}</div><p class="hint">Map debit/credit columns or one signed amount. Subcategories determine the main category; a default applies only to rows without a subcategory. Map final debit when reimporting adjusted transactions. ISO dates (YYYY-MM-DD) are supported.</p><div class="form-error" role="alert"></div><div class="actions" style="margin-top:20px"><button class="btn" type="submit">Review transactions ${icon('arrow')}</button></div></form></section>`;
  }
  const seen=new Set(D().transactions.map(C.fingerprint));
  const warnings=importReview.map(t=>{const key=C.fingerprint(t);const duplicate=seen.has(key);if(t.include)seen.add(key);return C.transactionError(t,D())||(duplicate?'Possible duplicate — exclude or verify':'');});
  return title+steps+`<section class="card"><div class="card-head"><div><h2>Make it yours before it’s saved.</h2><p>${importReview.filter(t=>t.include).length} selected of ${importReview.length} rows · ${esc(importState.name)} · ${esc(importState.currency)}</p></div>${button('exclude-invalid','Exclude invalid rows','check','secondary small')}</div><div style="padding:0 23px"><div class="notice">Check every row against your statement. Choose a subcategory for each row; the main category fills automatically. Highlighted rows need attention. Adjust final debit to preserve the original amounts and record a correction.</div></div><div class="table-wrap" style="max-height:530px"><table class="review"><thead><tr><th>Use</th><th>Date</th><th>Description</th><th>Subcategory</th><th>Main category · auto</th><th>Debit</th><th>Final debit</th><th>Credit</th><th>Review note</th></tr></thead><tbody>${importReview.map((t,i)=>`<tr class="${warnings[i]?'row-error':''} ${t.include?'':'row-excluded'}"><td><input type="checkbox" data-review="${i}" data-field="include" aria-label="Include row ${i+1}" ${t.include?'checked':''}></td><td><input type="date" value="${esc(t.date)}" data-review="${i}" data-field="date" aria-label="Date row ${i+1}"></td><td><input value="${esc(t.description)}" data-review="${i}" data-field="description" aria-label="Description row ${i+1}"></td><td><select data-review="${i}" data-field="subcategory" aria-label="Subcategory row ${i+1}">${subcategoryOptions(selectedSubcategory(t),t.subcategory?'Assign: '+t.subcategory:'Choose a subcategory')}</select></td><td><input readonly value="${esc(parentLabel(t))}" aria-label="Main category row ${i+1}"></td>${['debit','final','credit'].map(k=>`<td><input type="number" step=".01" ${k==='final'?'':'min="0"'} value="${amountValue(k==='final'?C.finalDebit(t):t[k])}" data-review="${i}" data-field="${k}" aria-label="${k} row ${i+1}"></td>`).join('')}<td><span class="hint">${esc(warnings[i]||'Ready')}</span></td></tr>`).join('')}</tbody></table></div><div style="padding:20px 23px"><label class="checkbox-label"><input id="accept-duplicates" type="checkbox"> Keep selected possible duplicates (I have checked them)</label><div class="actions" style="margin-top:18px">${button('finalize-import','Finalize selected transactions','check')}${button('back-mapping','Back to mapping','','secondary')}</div><p class="hint" style="margin-top:12px">Selected final debit: ${money(importReview.filter(t=>t.include).reduce((s,t)=>s+(Number.isFinite(C.finalDebit(t))?C.finalDebit(t):0),0),importState.currency,2)}</p></div></section>`;
}
function openModal(kind,title,body,{id='',submit='Save changes',remove=false,wide=false}={}) {
  modalState={kind,id};
  modal.style.maxWidth=wide?'850px':'650px';
  modal.innerHTML=`<form id="modal-form"><div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-action="close-modal" aria-label="Close">${icon('close')}</button></div><div class="modal-body">${body}<div class="form-error" role="alert"></div></div><div class="modal-footer">${remove?button('delete-item','Delete','trash','danger','style="margin-right:auto"'):''}${button('close-modal','Cancel','','secondary')}<button type="submit" class="btn">${esc(submit)}</button></div></form>`;
  modal.showModal();
}
function transactionModal(id='') {
  const t=D().transactions.find(t=>t.id===id)||{date:C.today(),description:'',categoryId:'',subcategory:'',account:'',currency:currency(),debit:0,credit:0,adjustment:0};
  openModal('transaction',id?'Edit transaction':'A new entry in your ledger',`<p class="modal-intro">Choose a subcategory; its main category fills automatically. Edit final debit to adjust the transaction while keeping the original debit and credit.</p><div class="form-grid">${field('Date','date','date',t.date,'required')}${select('Currency','currency',currencyOptions(t.currency||'INR'))}<div class="span2">${field('Description','description','text',t.description,'required maxlength="240" placeholder="What was it for?"')}</div>${select('Subcategory','subcategory',subcategoryOptions(selectedSubcategory(t)),'required')}${field('Main category · automatic','categoryDisplay','text',parentLabel(t),'readonly aria-live="polite"')}<div class="span2">${field('Account','account','text',t.account,'maxlength="100" placeholder="e.g. Everyday account"')}</div><div class="span2 amount-fields">${field('Debit','debit','number',amountValue(t.debit),'required min="0" step=".01"')}${field('Final debit (editable)','final','number',amountValue(C.finalDebit(t)),'required step=".01"')}${field('Credit','credit','number',amountValue(t.credit),'required min="0" step=".01"')}</div><div class="span2"><p class="hint" id="adjustment-hint" style="margin-top:9px">Adjustment: ${money(t.adjustment||0,t.currency||'INR',2)} · Final debit = debit − credit + adjustment</p></div></div>`,{id,remove:!!id,submit:id?'Save transaction':'Add transaction'});
  modalState.adjustment=t.adjustment||0;
}
function categoryModal(id='') {
  const c=D().categories.find(c=>c.id===id)||{name:'',typeId:'expense',subs:[]};
  openModal('category',id?'Edit category':'A category that fits your life',`<div class="form-grid">${field('Category name','name','text',c.name,'required maxlength="70"')}${select('Transaction type','typeId',D().types.map(t=>option(t.id,t.name,c.typeId)).join(''))}<label class="field span2">Subcategories (one per line)<textarea name="subs" rows="6" placeholder="Groceries&#10;Dining out">${esc(c.subs.join('\n'))}</textarea><small>Existing used subcategories are preserved. Add new ones freely.</small></label></div>`,{id,remove:!!id,submit:id?'Save category':'Create category'});
}
function typeModal(id='') {
  const t=D().types.find(t=>t.id===id)||{name:'',role:'expense'};
  openModal('type',id?'Edit transaction type':'Create transaction type',`<p class="modal-intro">Choose any name. The role determines whether its categories count as spending, income, or transfers in KPIs.</p><div class="form-grid">${field('Type name','name','text',t.name,'required maxlength="60"')}${select('KPI role','role',['expense','income','transfer'].map(v=>option(v,v[0].toUpperCase()+v.slice(1),t.role)).join(''))}</div>`,{id,remove:!!id});
}
function reportModal(id='') {
  const r=D().reports.find(r=>r.id===id)||{name:'',type:'bar',dimension:'category',column:'',measure:'final',from:'',to:'',categories:[],currency:currency()};
  openModal('report',id?'Shape this report':'Create a new perspective',`<div class="form-grid"><div class="span2">${field('Report name','name','text',r.name,'required maxlength="100" placeholder="e.g. Family spending by month"')}</div>${select('Visual type','type',Object.entries({bar:'Bar chart',line:'Line chart',donut:'Donut chart',pivot:'Pivot table'}).map(([v,l])=>option(v,l,r.type)).join(''))}${select('Amount to show','measure',Object.entries({final:'Final debit (after adjustments)',debit:'Debit',credit:'Credit',count:'Transaction count'}).map(([v,l])=>option(v,l,r.measure)).join(''))}${select('Group by / pivot rows','dimension',dimOptions(r.dimension))}${select('Pivot columns (pivot tables only)','column',option('','None',r.column)+dimOptions(r.column))}${field('From date (optional)','from','date',r.from)}${field('To date (optional)','to','date',r.to)}${select('Currency','currency',currencyOptions(r.currency||'INR'))}<label class="field span2">Included categories <small>Select any combination. Leave all unchecked to include all categories.</small><div class="grid cols2" style="gap:10px;padding-top:5px">${D().categories.map(c=>`<label class="checkbox-label"><input type="checkbox" name="categories" value="${esc(c.id)}" ${r.categories.includes(c.id)?'checked':''}>${esc(c.name)}</label>`).join('')}</div></label></div>`,{id,remove:!!id,submit:id?'Save report':'Create report'});
}
function budgetModal(id='') {
  const b=D().budgets.find(b=>b.id===id)||{period:budgetYear+(budgetMode==='month'?'-'+budgetMonth:''),categoryId:D().categories.find(c=>C.categoryRole(D(),c.id)==='expense')?.id,amount:0,currency:currency()};
  openModal('budget',id?'Adjust your budget':'Give your money a plan',`<p class="modal-intro">Use YYYY-MM for a month (2026-10), or YYYY for a whole year (2026). Historical plans remain available for comparison.</p><div class="form-grid">${select('Category','categoryId',D().categories.filter(c=>C.categoryRole(D(),c.id)==='expense').map(c=>option(c.id,c.name,b.categoryId)).join(''))}${select('Currency','currency',currencyOptions(b.currency||'INR'))}${field('Period: YYYY or YYYY-MM','period','text',b.period,'required pattern="[0-9]{4}(-[0-9]{2})?"')}${field('Planned amount','amount','number',amountValue(b.amount),'required min="0" step=".01"')}</div>`,{id,remove:!!id,submit:'Save budget'});
}
function familyModal(id='') {
  const f=D().family.find(f=>f.id===id)||{name:'',birthDate:''};
  openModal('family',id?'Family member':'Make room for someone',`<p class="modal-intro">Birth dates let Money Timeline calculate accurate ages on every future milestone.</p><div class="form-grid">${field('Name / relationship','name','text',f.name,'required maxlength="60" placeholder="Me, my wife, or a child’s name"')}${field('Date of birth','birthDate','date',f.birthDate,`required max="${C.today()}"`)}</div>`,{id,remove:!!id,submit:'Save family member'});
}
function milestoneModal(id='') {
  const m=D().milestones.find(m=>m.id===id)||{name:'',date:'',target:0,saved:0,monthly:0,rate:0,inflation:0,notes:'',memberId:'',currency:currency()};
  openModal('milestone',id?'Revisit this milestone':'A new chapter to plan for',`<div class="form-grid"><div class="span2">${field('Milestone name','name','text',m.name,'required maxlength="100" placeholder="A home, university, or a new chapter…"')}</div>${field('Milestone date','date','date',m.date,'required')}${select('Currency','currency',currencyOptions(m.currency||'INR'))}${select('Family member (optional)','memberId',option('','Whole family',m.memberId)+D().family.map(f=>option(f.id,f.name,m.memberId)).join(''))}${field('Target amount in today’s money','target','number',amountValue(m.target),'required min="0" step=".01"')}${field('Already set aside','saved','number',amountValue(m.saved),'required min="0" step=".01"')}${field('Monthly contribution','monthly','number',amountValue(m.monthly),'required min="0" step=".01"')}${field('Assumed annual return (%)','rate','number',m.rate,'required min="-99" max="100" step=".1"')}${field('Assumed annual inflation (%)','inflation','number',m.inflation,'required min="0" max="100" step=".1"')}<label class="field span2">Notes<textarea name="notes" rows="2" maxlength="400">${esc(m.notes)}</textarea></label><div class="notice span2" style="margin:0">These assumptions are yours to set. Each milestone is an independent plan; avoid assigning the same savings to more than one goal.</div></div>`,{id,remove:!!id,submit:'Save milestone'});
}
function passwordModal() {openModal('password','A new password for your ledger',`<div class="form-grid"><div class="span2">${field('Current password','current','password','','required autocomplete="current-password"')}</div>${field('New password','password','password','','required minlength="10" autocomplete="new-password"')}${field('Confirm new password','confirm','password','','required minlength="10" autocomplete="new-password"')}</div><div class="notice">Older backup files keep their original password. Create a new encrypted backup after changing your password.</div>`,{submit:'Change password'});}
async function download(name,text,type='text/csv') {
  if(demo && name.endsWith('.pocketledger'))throw new Error('Create your own ledger to export an encrypted backup.');
  if(window.AndroidBridge){window.AndroidBridge.saveFile(name,type,text);toast('Choose where to save the file.');return;}
  const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function chooseFile(accept) {return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept=accept;input.addEventListener('change',()=>resolve(input.files[0]));input.addEventListener('cancel',()=>resolve(null));input.click();});}
async function loadStatement(file) {
  if(!file)return;
  const current=session,password=document.querySelector('#pdf-password')?.value||'';
  toast('Reading your statement locally…');
  const result=await readFile(file,password);
  if(current!==session)return;
  const count=result.sheets.reduce((s,sh)=>s+sh.rows.length,0);
  if(count>10000)throw new Error('Please split this file into fewer than 10,000 rows.');
  if(!count)throw new Error('No rows were found in the file.');
  importState={...result,name:file.name,sheetIndex:0,headerIndex:0};importReview=[];render();
}
async function categoryImport() {
  const file=await chooseFile('.csv,.xlsx');if(!file)return;
  const current=session,read=await readFile(file);if(current!==session)return;
  const rows=read.sheets[0]?.rows||[],header=rows[0]?.map(v=>String(v).trim().toLowerCase())||[];
  const index=Object.fromEntries(['category','subcategory','type','role'].map(k=>[k,header.indexOf(k)]));
  if(index.category<0||index.type<0)throw new Error('Category files need Category, Subcategory, Type, and Role headers. Download the template to get started.');
  const parsed=rows.slice(1).filter(r=>r.some(Boolean)).map(r=>({name:String(r[index.category]||'').trim(),sub:String(r[index.subcategory]||'').trim(),type:String(r[index.type]||'Expense').trim(),role:String(r[index.role]||'expense').trim().toLowerCase()}));
  if(!parsed.length||parsed.length>1000)throw new Error('Upload between 1 and 1,000 category rows.');
  if(parsed.some(r=>!r.name||!['expense','income','transfer'].includes(r.role)))throw new Error('Each row needs a category name and an expense, income or transfer role.');
  categoryUpload=parsed;
  openModal('category-import','Review your categories',`<p class="modal-intro">${parsed.length} rows from ${esc(file.name)}. Matching names are merged; existing categories and transactions are preserved. The first worksheet is used.</p><div class="table-wrap" style="max-height:360px"><table><thead><tr><th>Category</th><th>Subcategory</th><th>Type</th><th>KPI role</th></tr></thead><tbody>${parsed.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.sub)}</td><td>${esc(r.type)}</td><td>${esc(r.role)}</td></tr>`).join('')}</tbody></table></div>`,{submit:'Import categories',wide:true});
}
async function startRestore() {
  if(demo)throw new Error('Leave the preview to restore a real ledger.');
  const file=await chooseFile('.pocketledger,.json');if(!file)return;
  if(file.size>60*1024*1024)throw new Error('This backup exceeds 60 MB.');
  const backup=JSON.parse(await file.text());
  openModal('restore-unlock','Open your encrypted backup',`<p class="modal-intro">${esc(file.name)} · Enter the password used when this backup was created. You will review the contents before replacing this ledger.</p>${field('Backup password','password','password','','required autocomplete="off"')}`,{submit:'Review backup'});modalState.backup=backup;
}
async function submitModal(form) {
  const f=new FormData(form),v=k=>String(f.get(k)||'').trim(),id=modalState.id||C.uid(),kind=modalState.kind;
  if(kind==='transaction') {
    const debit=C.moneyInput(v('debit')),credit=C.moneyInput(v('credit')),final=C.moneyInput(v('final'));
    const t={id,date:v('date'),description:v('description'),currency:v('currency'),...(C.resolveClassification(D().categories,v('subcategory'))||{categoryId:'',subcategory:''}),account:v('account'),debit,credit,adjustment:final-debit+credit};
    const error=C.transactionError(t,D());if(error)throw new Error(error);
    await mutate(d=>{const index=d.transactions.findIndex(t=>t.id===id);if(index>=0)d.transactions[index]={...d.transactions[index],...t};else d.transactions.push(t);});
  } else if(kind==='category') {
    const name=v('name');if(!name)throw new Error('Enter a category name.');
    if(D().categories.some(c=>c.id!==id&&c.name.toLowerCase()===name.toLowerCase()))throw new Error('A category with this name already exists.');
    const subs=[...new Set(v('subs').split('\n').map(s=>s.trim()).filter(Boolean))];
    const used=D().transactions.filter(t=>t.categoryId===id&&t.subcategory).map(t=>t.subcategory);
    if(used.some(s=>!subs.includes(s)))throw new Error('A removed subcategory is still used by transactions. Reassign those transactions first.');
    const cat={id,name,typeId:v('typeId'),subs};
    await mutate(d=>{const index=d.categories.findIndex(c=>c.id===id);if(index>=0)d.categories[index]=cat;else d.categories.push(cat);});
  } else if(kind==='type') {
    if(D().types.some(t=>t.id!==id&&t.name.toLowerCase()===v('name').toLowerCase()))throw new Error('A type with this name already exists.');
    await mutate(d=>{const t={id,name:v('name'),role:v('role')},index=d.types.findIndex(t=>t.id===id);if(index>=0)d.types[index]=t;else d.types.push(t);});
  } else if(kind==='report') {
    if(v('from')&&v('to')&&v('from')>v('to'))throw new Error('The start date must come before the end date.');
    const r={id,name:v('name'),type:v('type'),dimension:v('dimension'),column:v('type')==='pivot'?v('column'):'',measure:v('measure'),from:v('from'),to:v('to'),categories:f.getAll('categories'),currency:v('currency')};
    if(r.column===r.dimension)throw new Error('Choose different dimensions for pivot rows and columns.');
    await mutate(d=>{const i=d.reports.findIndex(r=>r.id===id);if(i>=0)d.reports[i]=r;else d.reports.push(r);});
  } else if(kind==='budget') {
    const b={id,period:v('period'),categoryId:v('categoryId'),currency:v('currency'),amount:C.moneyInput(v('amount'))};
    if(!/^\d{4}(-(?:0[1-9]|1[0-2]))?$/.test(b.period)||+b.period.slice(0,4)<1900||+b.period.slice(0,4)>2200)throw new Error('Use a valid year (1900–2200) or year-month, such as 2026-10.');
    if(!b.categoryId||!Number.isSafeInteger(b.amount)||b.amount<0)throw new Error('Choose an expense category and a valid planned amount.');
    if(C.budgetConflict(D(),b))throw new Error('This category already has an overlapping plan in this currency. Edit it, or use only monthly or only yearly plans for the year.');
    await mutate(d=>{const i=d.budgets.findIndex(b=>b.id===id);if(i>=0)d.budgets[i]=b;else d.budgets.push(b);});
  } else if(kind==='family') {
    const member={id,name:v('name'),birthDate:C.normalizeDate(v('birthDate'))};
    if(!member.birthDate||member.birthDate>C.today())throw new Error('Choose a valid birth date no later than today.');
    await mutate(d=>{const i=d.family.findIndex(f=>f.id===id);if(i>=0)d.family[i]=member;else d.family.push(member);});
  } else if(kind==='milestone') {
    const m={id,name:v('name'),date:v('date'),target:C.moneyInput(v('target')),saved:C.moneyInput(v('saved')),monthly:C.moneyInput(v('monthly')),rate:+v('rate'),inflation:+v('inflation'),notes:v('notes'),memberId:v('memberId'),currency:v('currency')};
    if(!C.normalizeDate(m.date)||![m.target,m.saved,m.monthly].every(n=>Number.isSafeInteger(n)&&n>=0)||!Number.isFinite(C.projection(m).projected))throw new Error('Check the date, amounts and projection assumptions.');
    await mutate(d=>{const i=d.milestones.findIndex(t=>t.id===id);if(i>=0)d.milestones[i]=m;else d.milestones.push(m);});
  } else if(kind==='category-import') {
    await mutate(d=>{for(const row of categoryUpload) {
      let type=d.types.find(t=>t.name.toLowerCase()===row.type.toLowerCase());
      if(type&&type.role!==row.role)throw new Error(`Type “${row.type}” already has the ${type.role} role. Correct the upload to match.`);
      if(!type){type={id:C.uid(),name:row.type,role:row.role};d.types.push(type);}
      let cat=d.categories.find(c=>c.name.toLowerCase()===row.name.toLowerCase());
      if(cat&&cat.typeId!==type.id)throw new Error(`Category “${row.name}” belongs to a different type. Correct the upload or rename the new category.`);
      if(!cat){cat={id:C.uid(),name:row.name,typeId:type.id,subs:[]};d.categories.push(cat);}
      if(row.sub&&!cat.subs.includes(row.sub))cat.subs.push(row.sub);
    }});categoryUpload=null;
  } else if(kind==='password') {
    if(demo)throw new Error('Password changes are available in your own ledger.');
    if(v('password')!==v('confirm'))throw new Error('The new passwords do not match.');
    const current=session;await Vault.unlock(envelope,String(f.get('current')));
    if(session!==current)throw new Error('The vault was locked. Unlock and try again.');
    await saveQueue;
    const next=await Vault.createVault(current.data,String(f.get('password')));
    if(session!==current)throw new Error('The ledger was locked. Unlock and try the password change again.');
    await Vault.writeEnvelope(next.envelope);envelope=next.envelope;
    if(session===current&&!document.hidden)session=next;
    toast('Password changed. Create a new encrypted backup.');
  } else if(kind==='restore-unlock') {
    const activeModal=modalState,backup=modalState.backup,restored=await Vault.unlock(backup,String(f.get('password')));
    if(modalState!==activeModal || document.hidden)throw new Error('The backup review was closed. Open the backup again.');
    openModal('restore-confirm','Your backup is ready',`<p class="modal-intro">This backup contains ${restored.data.transactions.length} transactions, ${restored.data.categories.length} categories, ${restored.data.budgets.length} budgets and ${restored.data.milestones.length} milestones.</p><div class="notice warning">Restoring will replace the ledger currently on this device. Back up the current ledger first if you want to keep it. Your restored ledger uses the backup’s password.</div>`,{submit:'Replace ledger with backup'});modalState.restored=restored;modalState.backup=backup;return;
  } else if(kind==='restore-confirm') {
    const activeModal=modalState,{backup,restored}=modalState;await saveQueue;await Vault.writeEnvelope(backup);envelope=backup;
    if(modalState===activeModal&&!document.hidden)session=restored;
    demo=false;view='dashboard';importState=null;importReview=[];toast('Encrypted backup restored.');
  } else if(kind==='delete-confirm') {
    const {group,targetId}=modalState;
    await mutate(d=>{d[group]=d[group].filter(x=>x.id!==targetId);if(group==='family')d.milestones.forEach(m=>{if(m.memberId===targetId)m.memberId='';});},'Entry deleted');
  }
  modal.close();modal.innerHTML='';modalState={};render();
}
function confirmDelete() {
  const group=({transaction:'transactions',category:'categories',type:'types',report:'reports',budget:'budgets',family:'family',milestone:'milestones'})[modalState.kind],targetId=modalState.id;
  if(!group||!targetId)return;
  if(group==='categories' && (D().transactions.some(t=>t.categoryId===targetId)||D().budgets.some(b=>b.categoryId===targetId)||D().reports.some(r=>r.categories.includes(targetId))))throw new Error('This category is used by transactions, budgets or reports. Reassign those entries first.');
  if(group==='types'&&D().categories.some(c=>c.typeId===targetId))throw new Error('This type is used by a category. Reassign that category first.');
  openModal('delete-confirm','Delete this entry?',`<p class="modal-intro">This removes the entry from your ledger. Existing backups are unaffected.</p>`,{submit:'Delete entry'});modalState.group=group;modalState.targetId=targetId;
}
async function finalizeImport() {
  const selected=importReview.filter(t=>t.include),known=new Set(D().transactions.map(C.fingerprint));
  if(!selected.length)throw new Error('Select at least one row to import.');
  for(const t of selected) {
    const error=C.transactionError(t,D());if(error)throw new Error(`${t.description||'A selected row'}: ${error}`);
    const key=C.fingerprint(t);if(known.has(key)&&!document.querySelector('#accept-duplicates').checked)throw new Error('Possible duplicates are selected. Exclude them or confirm that you want to keep them.');known.add(key);
  }
  const batchId=C.uid();
  await mutate(d=>{d.transactions.push(...selected.map(({sourceRow,include,...t})=>({...t,importId:batchId})));d.imports.push({id:batchId,name:importState.name,date:C.today(),count:selected.length,currency:importState.currency});},`${selected.length} transactions imported`);
  importState=null;importReview=[];view='transactions';render();
}
function budgetCSV(){const p=budgetYear+(budgetMode==='month'?'-'+budgetMonth:''),prev=compareYear+(budgetMode==='month'?'-'+budgetMonth:'');return C.toCSV([['Category','Currency','Period','Planned','Actual','Remaining','Comparison period','Previous planned','Previous actual'],...D().categories.filter(c=>C.categoryRole(D(),c.id)==='expense').map(c=>[c.name,currency(),p,C.planned(D(),c.id,p)/100,C.actual(D(),c.id,p)/100,(C.planned(D(),c.id,p)-C.actual(D(),c.id,p))/100,prev,C.planned(D(),c.id,prev)/100,C.actual(D(),c.id,prev)/100])]);}
function timelineCSV(){return C.toCSV([['Milestone','Date','Month','Year','Currency',...D().family.map(f=>f.name+' age'),'Target today','Future target','Saved today','Monthly contribution','Annual return %','Annual inflation %','Projected savings','Shortfall','Notes'],...D().milestones.filter(m=>(m.currency||'INR')===currency()).map(m=>{const p=C.projection(m);return[m.name,m.date,m.date.slice(0,7),m.date.slice(0,4),m.currency||'INR',...D().family.map(f=>C.ageOn(f.birthDate,m.date)),m.target/100,p.required/100,m.saved/100,m.monthly/100,m.rate,m.inflation,p.projected/100,p.gap/100,m.notes];})]);}
async function onAction(action,id) {
  const editors={'add-transaction':transactionModal,'edit-transaction':transactionModal,'add-category':categoryModal,'edit-category':categoryModal,'add-type':typeModal,'edit-type':typeModal,'add-report':reportModal,'edit-report':reportModal,'add-budget':budgetModal,'edit-budget':budgetModal,'add-family':familyModal,'edit-family':familyModal,'add-milestone':milestoneModal,'edit-milestone':milestoneModal};
  if(editors[action]){editors[action](id||'');return;}
  if(action==='enter-demo'){demo=true;session={data:demoData()};view='dashboard';render();}
  else if(action==='exit-demo'){if(document.documentElement.dataset.preview==='true'){toast('This is a visual preview. Use the Android app or localhost version for your private ledger.');return;}demo=false;session=null;importState=null;importReview=[];modal.close();modal.innerHTML='';history.replaceState(null,'',location.pathname);envelope=await Vault.readEnvelope();renderAuth();}
  else if(action==='lock')await lock();
  else if(action==='menu')document.querySelector('.sidebar').classList.toggle('open');
  else if(action==='go-import'){view='imports';render();}
  else if(action==='close-modal'){modal.close();modal.innerHTML='';modalState={};categoryUpload=null;}
  else if(action==='delete-item')confirmDelete();
  else if(action==='tx-prev'){txPage=Math.max(0,txPage-1);render();}
  else if(action==='tx-next'){txPage++;render();}
  else if(action==='reset-import'){importState=null;importReview=[];render();}
  else if(action==='back-mapping'){importReview=[];render();}
  else if(action==='apply-pdf-text'){const raw=document.querySelector('#pdf-raw').value;importState.raw=raw;importState.sheets[0].rows=C.parseCSV(raw,'\t');importState.headerIndex=0;render();}
  else if(action==='exclude-invalid'){importReview.forEach(t=>{if(C.transactionError(t,D()))t.include=false;});render();}
  else if(action==='finalize-import')await finalizeImport();
  else if(action==='import-categories')await categoryImport();
  else if(action==='category-template')await download('category-template.csv','Category,Subcategory,Type,Role\r\nFood & groceries,Groceries,Expense,expense\r\nFood & groceries,Dining out,Expense,expense\r\nSalary,Monthly pay,Salary,income\r\nSavings,Own accounts,Transfer,transfer');
  else if(action==='statement-template')await download('statement-template.csv','Date,Description,Debit,Credit,Category,Subcategory,Account\r\n01/10/2026,Monthly salary,0,125000,Salary,Monthly pay,Everyday account\r\n02/10/2026,Weekly groceries,2500,0,Food & groceries,Groceries,Everyday account');
  else if(action==='export-all')await download('all-transactions.csv',C.exportTransactions(D()));
  else if(action==='export-transactions')await download('transactions-'+currency()+'.csv',C.exportTransactions({...D(),transactions:filteredTransactions()}));
  else if(action==='export-budget')await download('budget-comparison-'+currency()+'.csv',budgetCSV());
  else if(action==='export-timeline')await download('money-timeline-'+currency()+'.csv',timelineCSV());
  else if(action==='budget-month'){budgetMode='month';render();}
  else if(action==='budget-year'){budgetMode='year';render();}
  else if(action==='copy-report'){await mutate(d=>{const r=d.reports.find(r=>r.id===id);d.reports.push({...structuredClone(r),id:C.uid(),name:r.name+' (copy)'});});render();}
  else if(action==='export-report'){const r=D().reports.find(r=>r.id===id),p=C.pivot(D(),r),unit=r.measure==='count'?1:100;await download('report-'+r.type+'.csv',C.toCSV([[r.dimension,...p.columns,'Grand total','Currency'],...p.rows.map(row=>[row,...p.columns.map(c=>p.get(row,c)/unit),p.columns.reduce((s,c)=>s+p.get(row,c),0)/unit,r.currency||'INR']),['Grand total',...p.columns.map(c=>p.rows.reduce((s,row)=>s+p.get(row,c),0)/unit),C.reportRows(D(),r).reduce((s,t)=>s+C.measure(t,r.measure),0)/unit,r.currency||'INR']]));}
  else if(action==='backup'){await saveQueue;await download('pocket-ledger-'+C.today()+'.pocketledger',JSON.stringify(envelope),'application/json');}
  else if(action==='restore'||action==='restore-locked')await startRestore();
  else if(action==='change-password')passwordModal();
}
document.addEventListener('click',async e=>{
  lastActivity=Date.now();const target=e.target.closest('[data-action],[data-view]');if(!target)return;
  if(target.dataset.view){if(!session)return;view=target.dataset.view;render();return;}
  try{await onAction(target.dataset.action,target.dataset.id);}catch(error){const errorBox=modal.open?modal.querySelector('.form-error'):null;if(errorBox)errorBox.textContent=error.message;else toast(error.message);}
});
document.addEventListener('submit',async e=>{
  e.preventDefault();const form=e.target,submit=form.querySelector('[type=submit]');if(submit?.disabled)return;if(submit)submit.disabled=true;
  try {
    if(form.id==='auth-form') {
      authBusy=true;lockRequested=false;const f=new FormData(form),password=String(f.get('password'));
      if(envelope){session=await Vault.unlock(envelope,password);}
      else {if(password!==f.get('confirm'))throw new Error('The passwords do not match.');const created=await Vault.createVault(C.newData(),password);await Vault.writeEnvelope(created.envelope);envelope=created.envelope;session=created;}
      demo=false;lastActivity=Date.now();view='dashboard';if(document.hidden||lockRequested)await lock();else render();
    } else if(form.id==='modal-form')await submitModal(form);
    else if(form.id==='preferences-form'){const f=new FormData(form);await mutate(d=>{d.settings={...d.settings,currency:String(f.get('currency')),dateFormat:String(f.get('dateFormat')),autoLock:+f.get('autoLock')};});render();}
    else if(form.id==='map-form') {
      const f=new FormData(form),mapping={};for(const key of ['date','description','debit','final','credit','amount','category','subcategory','account'])mapping[key]=+f.get(key);
      if(mapping.date<0||mapping.description<0)throw new Error('Map both date and description columns.');
      if(mapping.debit<0&&mapping.credit<0&&mapping.amount<0)throw new Error('Map a debit, credit or signed-amount column.');
      if(mapping.amount>=0&&(mapping.debit>=0||mapping.credit>=0))throw new Error('Use either separate debit/credit columns or signed amount, not both.');
      const used=Object.values(mapping).filter(v=>v>=0);if(new Set(used).size!==used.length)throw new Error('Each statement column can only be mapped once.');
      const sheet=importState.sheets[importState.sheetIndex||0];
      importState.currency=String(f.get('currency'));
      importReview=mapTransactions(sheet.rows.slice((importState.headerIndex||0)+1),mapping,{dateFormat:String(f.get('dateFormat')),account:String(f.get('accountName')),defaultSubcategory:String(f.get('defaultSubcategory')),categories:D().categories,signedMode:String(f.get('signedMode')),date1904:sheet.date1904}).map(t=>({...t,currency:importState.currency}));
      if(!importReview.length)throw new Error('There are no transaction rows after the selected header.');
      const seen=new Set(D().transactions.map(C.fingerprint));for(const t of importReview){const key=C.fingerprint(t);if(seen.has(key))t.include=false;seen.add(key);}
      render();
    }
  } catch(error){const box=form.querySelector('.form-error');if(box)box.textContent=error.message;else toast(error.message);}
  finally{authBusy=false;if(submit)submit.disabled=false;}
});
document.addEventListener('change',async e=>{
  lastActivity=Date.now();const t=e.target;
  try {
    if(t.id==='statement-file'){await loadStatement(t.files[0]);return;}
    if(t.dataset.review!==undefined){const row=importReview[+t.dataset.review],field=t.dataset.field;if(field==='include')row.include=t.checked;else if(field==='final')row.adjustment=C.moneyInput(t.value)-row.debit+row.credit;else if(field==='debit'||field==='credit')row[field]=C.moneyInput(t.value);else if(field==='subcategory')Object.assign(row,C.resolveClassification(D().categories,t.value)||{categoryId:'',subcategory:''});else row[field]=t.value;render();return;}
    if(t.id==='currency-select'){await mutate(d=>d.settings.currency=t.value,'');txPage=0;render();}
    else if(t.id==='overview-period'&&t.value){period=t.value;render();}
    else if(t.id==='tx-category'){txCategory=t.value;txPage=0;render();}
    else if(t.id==='tx-from'){txFrom=t.value;txPage=0;render();}
    else if(t.id==='tx-to'){txTo=t.value;txPage=0;render();}
    else if(t.id==='budget-year'&&t.validity.valid&&t.value){budgetYear=t.value;render();}
    else if(t.id==='budget-month'){budgetMonth=t.value;render();}
    else if(t.id==='compare-year'&&t.validity.valid&&t.value){compareYear=t.value;render();}
    else if(t.id==='import-sheet'){importState.sheetIndex=+t.value;importState.headerIndex=0;render();}
    else if(t.id==='header-row'&&t.validity.valid){importState.headerIndex=+t.value-1;render();}
    if(modal.open && modalState.kind==='transaction'&&t.name==='subcategory'){const selected=C.resolveClassification(D().categories,t.value);modal.querySelector('[name=categoryDisplay]').value=selected?categoryName(selected.categoryId):'Choose a subcategory';}
  }catch(error){toast(error.message);}
});
document.addEventListener('input',e=>{
  lastActivity=Date.now();const t=e.target;
  if(t.id==='tx-search'){const position=t.selectionStart;txSearch=t.value;txPage=0;render();const next=document.querySelector('#tx-search');next.focus();next.setSelectionRange(position,position);}
  if(modal.open&&modalState.kind==='transaction'&&['debit','credit','final','currency'].includes(t.name)) {
    const debit=C.moneyInput(modal.querySelector('[name=debit]').value),credit=C.moneyInput(modal.querySelector('[name=credit]').value),final=modal.querySelector('[name=final]');
    if(t.name==='final')modalState.adjustment=C.moneyInput(final.value)-debit+credit;else if(t.name!=='currency')final.value=amountValue(debit-credit+(modalState.adjustment||0));
    modal.querySelector('#adjustment-hint').textContent='Adjustment: '+money(modalState.adjustment||0,modal.querySelector('[name=currency]').value,2)+' · Final debit = debit − credit + adjustment';
  }
});
document.addEventListener('dragover',e=>{if(e.target.closest('#drop-zone'))e.preventDefault();});
document.addEventListener('drop',async e=>{if(e.target.closest('#drop-zone')){e.preventDefault();try{await loadStatement(e.dataTransfer.files[0]);}catch(error){toast(error.message);}}});
document.addEventListener('pointerdown',()=>lastActivity=Date.now(),{passive:true});
document.addEventListener('keydown',()=>lastActivity=Date.now());
document.addEventListener('visibilitychange',()=>{if(document.hidden&&!window.AndroidBridge?.isFilePickerOpen())lock();});
window.pocketLedgerLock=()=>lock();
setInterval(()=>{if(session&&!demo&&!authBusy&&Date.now()-lastActivity>D().settings.autoLock*60000)lock();},10000);
async function start() {
  if(demo){session={data:demoData()};view=new URLSearchParams(location.search).get('view')||'dashboard';render();return;}
  try {if(!crypto.subtle)throw new Error('Open the installed Android app or the localhost preview to use the encrypted vault.');envelope=await Vault.readEnvelope();renderAuth();}
  catch(error){app.innerHTML=`<div class="empty"><h2>Unable to open the local vault</h2><p>${esc(error.message)}</p></div>`;}
}
start();
