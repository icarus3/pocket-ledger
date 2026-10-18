export const uid = () => crypto.randomUUID();
export const round = n => Math.round(n + Number.EPSILON);
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const finalDebit = t => t.debit - t.credit + (t.adjustment ?? 0);
export function moneyInput(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? round(value * 100) : NaN;
  let s = String(value ?? '').trim();
  if (!s || s === '-' || s === '—') return 0;
  const negative = /^\(.*\)$/.test(s) || /\bDR$/i.test(s);
  s = s.replace(/[₹$£€¥,\s()]/g,'').replace(/(?:CR|DR)$/i,'');
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(s)) return NaN;
  return round(Number(s) * 100) * (negative ? -1 : 1);
}
export function normalizeDate(value, format = 'DMY') {
  if (typeof value === 'number' && value > 0 && value < 100000) return new Date(Date.UTC(1899,11,30) + Math.floor(value)*86400000).toISOString().slice(0,10);
  const s = String(value ?? '').trim();
  let y,m,d;
  let match = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/);
  if (match) [,y,m,d] = match;
  else if ((match = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
    y = match[3]; m = match[format === 'MDY' ? 1 : 2]; d = match[format === 'MDY' ? 2 : 1];
  } else if ((match = s.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{4})$/))) {
    d = match[1]; m = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].toLowerCase()) + 1; y = match[3];
  } else return '';
  const date = new Date(Date.UTC(+y,+m-1,+d));
  return date.getUTCFullYear() === +y && date.getUTCMonth() === +m-1 && date.getUTCDate() === +d ? date.toISOString().slice(0,10) : '';
}
export function parseCSV(text, delimiter) {
  text = text.replace(/^\uFEFF/,'');
  if (!delimiter) {
    const first = text.split(/\r?\n/)[0];
    delimiter = ['\t',';',','].map(d => [d,first.split(d).length]).sort((a,b) => b[1]-a[1])[0][0];
  }
  const rows = []; let row = [], cell = '', quote = false;
  for (let i=0;i<text.length;i++) {
    const c = text[i];
    if (c === '"') { if (quote && text[i+1] === '"') { cell += '"'; i++; } else if (quote || cell === '') quote = !quote; else cell += c; }
    else if (c === delimiter && !quote) { row.push(cell.trim()); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quote) { if (c === '\r' && text[i+1] === '\n') i++; row.push(cell.trim()); if(row.some(Boolean)) rows.push(row); row=[]; cell=''; }
    else cell += c;
  }
  if (quote) throw new Error('An opening quote in this file has no closing quote. Correct the CSV and try again.');
  row.push(cell.trim()); if(row.some(Boolean)) rows.push(row);
  return rows;
}
export function toCSV(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = String(value ?? '');
    // Neutralize spreadsheet formulas in text cells while keeping numeric amounts numeric.
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"','""') + '"';
  }).join(',')).join('\r\n');
}
export function newData() {
  return {version:1, settings:{currency:'INR',dateFormat:'DMY',autoLock:5},
    types:[{id:'expense',name:'Expense',role:'expense'},{id:'income',name:'Income',role:'income'},{id:'salary',name:'Salary',role:'income'},{id:'transfer',name:'Transfer',role:'transfer'}],
    categories:[{id:'home',name:'Home & living',typeId:'expense',subs:['Rent','Utilities','Maintenance']},{id:'food',name:'Food & groceries',typeId:'expense',subs:['Groceries','Dining out']},{id:'travel',name:'Transport',typeId:'expense',subs:['Fuel','Public transport']},{id:'family',name:'Family & care',typeId:'expense',subs:['Education','Health','Activities']},{id:'life',name:'Lifestyle',typeId:'expense',subs:['Shopping','Subscriptions']},{id:'pay',name:'Salary',typeId:'salary',subs:['Monthly pay','Bonus']},{id:'other',name:'Other income',typeId:'income',subs:['Interest','Refunds']}],
    transactions:[],budgets:[],reports:[],family:[],milestones:[],imports:[]};
}
export function categoryRole(data, id) { const c = data.categories.find(c => c.id === id); return data.types.find(t => t.id === c?.typeId)?.role; }
export const classificationValue = (categoryId, subcategory) => JSON.stringify([categoryId, subcategory]);
export function resolveClassification(categories, value) {
  try {
    const pair = JSON.parse(value);
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    const category = categories.find(c => c.id === pair[0]);
    return category?.subs.includes(pair[1]) ? {categoryId:category.id, subcategory:pair[1]} : null;
  } catch { return null; }
}
export function matchSubcategory(categories, subcategory, parentName = '') {
  const normalize = value => String(value ?? '').trim().toLowerCase();
  const name = normalize(subcategory);
  if (!name) return null;
  const matches = categories.flatMap(c => c.subs.filter(s => normalize(s) === name).map(s => ({categoryId:c.id, subcategory:s})));
  if (matches.length === 1) return matches[0];
  const parent = categories.find(c => normalize(c.name) === normalize(parentName));
  const qualified = matches.filter(m => m.categoryId === parent?.id);
  return qualified.length === 1 ? qualified[0] : null;
}
export function transactionError(t, data, {requireSubcategory = true} = {}) {
  if(!['INR','CHF','USD'].includes(t.currency || data.settings.currency))return 'Choose INR, CHF or USD.';
  if (!normalizeDate(t.date)) return 'Enter a valid date.';
  if (!String(t.description || '').trim()) return 'Add a description.';
  if (![t.debit,t.credit,t.adjustment ?? 0].every(n => Number.isSafeInteger(n) && Math.abs(n) < 1e14) || t.debit < 0 || t.credit < 0) return 'Enter valid amounts with up to two decimal places. Debit and credit cannot be negative.';
  if (t.debit === 0 && t.credit === 0 && !t.adjustment) return 'Add a debit or credit amount.';
  const category = data.categories.find(c => c.id === t.categoryId);
  if (!category || (requireSubcategory && !t.subcategory) || (t.subcategory && !category.subs.includes(t.subcategory))) return 'Choose a valid subcategory; its main category is assigned automatically.';
  return '';
}
export function fingerprint(t) { return [t.date,String(t.description).trim().toLowerCase().replace(/\s+/g,' '),t.debit,t.credit,String(t.account || '').trim().toLowerCase(),t.currency||'INR'].join('|'); }
export function dimension(t, key, data) {
  if(key === 'date') return t.date;
  if(key === 'month') return t.date.slice(0,7);
  if(key === 'year') return t.date.slice(0,4);
  if(key === 'category') return data.categories.find(c => c.id === t.categoryId)?.name || 'Uncategorized';
  if(key === 'subcategory') return t.subcategory || 'Unspecified';
  if(key === 'type') {const c=data.categories.find(c => c.id === t.categoryId); return data.types.find(v=>v.id===c?.typeId)?.name || 'Unspecified';}
  return t.account || 'Default account';
}
export const measure = (t,key) => key === 'final' ? finalDebit(t) : key === 'count' ? 1 : t[key] || 0;
export function reportRows(data, report) { return data.transactions.filter(t => (t.currency||'INR')===(report.currency||data.settings.currency) && (!report.from || t.date >= report.from) && (!report.to || t.date <= report.to) && (!report.categories?.length || report.categories.includes(t.categoryId))); }
export function pivot(data, report) {
  const cells=new Map(), rows=new Set(), cols=new Set();
  for (const t of reportRows(data,report)) {
    const r=dimension(t,report.dimension,data), c=report.column ? dimension(t,report.column,data) : 'Total'; rows.add(r); cols.add(c);
    const key=JSON.stringify([r,c]); cells.set(key,(cells.get(key)||0)+measure(t,report.measure));
  }
  return {rows:[...rows].sort(),columns:[...cols].sort(),get:(r,c)=>cells.get(JSON.stringify([r,c]))||0};
}
export function actual(data,categoryId,period) {
  return data.transactions.filter(t=>(t.currency||'INR')===data.settings.currency && t.date.startsWith(period) && (!categoryId || t.categoryId===categoryId) && categoryRole(data,t.categoryId)==='expense').reduce((s,t)=>s+finalDebit(t),0);
}
export function planned(data,categoryId,period) {
  return data.budgets.filter(b=>(b.currency||'INR')===data.settings.currency && b.categoryId===categoryId && (b.period===period || (period.length===4 && b.period.startsWith(period+'-')))).reduce((s,b)=>s+b.amount,0);
}
export function budgetConflict(data, budget) {
  return data.budgets.some(b=>b.id!==budget.id && (b.currency||'INR')===(budget.currency||'INR') && b.categoryId===budget.categoryId && (b.period===budget.period || (b.period.length!==budget.period.length && b.period.slice(0,4)===budget.period.slice(0,4))));
}
export function ageOn(birthDate, date) {
  if(!birthDate || !date || date < birthDate) return '—';
  let age=+date.slice(0,4)-+birthDate.slice(0,4);
  if(date.slice(5)<birthDate.slice(5))age--;
  return age;
}
export function projection(m, base = today()) {
  const start=new Date(base+'T00:00:00Z'), end=new Date(m.date+'T00:00:00Z');
  const months=Math.max(0,(end.getUTCFullYear()-start.getUTCFullYear())*12 + end.getUTCMonth()-start.getUTCMonth() - (end.getUTCDate()<start.getUTCDate()?1:0));
  const rate=Math.pow(1+(m.rate||0)/100,1/12)-1;
  const factor=Math.pow(1+rate,months);
  const projected=round(m.saved*factor + m.monthly*(Math.abs(rate)<1e-10?months:(factor-1)/rate));
  const required=round(m.target*Math.pow(1+(m.inflation||0)/100,months/12));
  return {months,projected,required,gap:Math.max(0,required-projected)};
}
export function exportTransactions(data) {
  return toCSV([['Date','Month','Year','Description','Type','Category','Subcategory','Account','Currency','Debit','Final debit','Credit'],...data.transactions.map(t=>[t.date,t.date.slice(0,7),t.date.slice(0,4),t.description,dimension(t,'type',data),dimension(t,'category',data),t.subcategory,t.account,t.currency||'INR',t.debit/100,finalDebit(t)/100,t.credit/100])]);
}
export function validateData(data) {
  if(data?.version!==1 || !data.settings || !['types','categories','transactions','budgets','reports','family','milestones','imports'].every(k=>Array.isArray(data[k]))) throw new Error('This is not a supported Pocket Ledger backup.');
  if(!['INR','CHF','USD'].includes(data.settings.currency) || !['DMY','MDY'].includes(data.settings.dateFormat) || ![1,2,5,10,15].includes(data.settings.autoLock)) throw new Error('Invalid backup settings.');
  for(const group of ['types','categories','transactions','budgets','reports','family','milestones']) { const ids=data[group].map(x=>x.id); if(ids.some(x=>typeof x!=='string') || new Set(ids).size!==ids.length)throw new Error('Invalid backup identifiers.'); }
  if(data.types.some(t=>!['expense','income','transfer'].includes(t.role) || typeof t.name!=='string'))throw new Error('Invalid transaction types.');
  if(data.categories.some(c=>typeof c.name!=='string'||!Array.isArray(c.subs)||!c.subs.every(s=>typeof s==='string')||!data.types.some(t=>t.id===c.typeId)))throw new Error('Invalid categories.');
  // Keep older backups readable; new/edited transactions require a subcategory.
  if(data.transactions.some(t=>transactionError(t,data,{requireSubcategory:false})))throw new Error('The backup contains invalid transactions.');
  if(data.budgets.some(b=>!/^\d{4}(-(?:0[1-9]|1[0-2]))?$/.test(b.period)||!Number.isSafeInteger(b.amount)||b.amount<0||!data.categories.some(c=>c.id===b.categoryId)))throw new Error('Invalid budget data.');
  if(data.family.some(f=>!normalizeDate(f.birthDate)||typeof f.name!=='string'))throw new Error('Invalid family data.');
  if(data.reports.some(r=>typeof r.name!=='string'||!['line','bar','donut','pivot'].includes(r.type)||!['final','debit','credit','count'].includes(r.measure)||!['date','month','year','category','subcategory','type','account'].includes(r.dimension)||!['','date','month','year','category','subcategory','type','account'].includes(r.column)||!Array.isArray(r.categories)||r.categories.some(id=>!data.categories.some(c=>c.id===id))||(r.from&&!normalizeDate(r.from))||(r.to&&!normalizeDate(r.to))))throw new Error('Invalid report data.');
  for(const group of ['transactions','budgets','reports','milestones'])if(data[group].some(x=>x.currency&&!['INR','CHF','USD'].includes(x.currency)))throw new Error('Invalid currency in backup.');
  if(data.imports.some(i=>typeof i.name!=='string'||!normalizeDate(i.date)||!Number.isSafeInteger(i.count)||i.count<0))throw new Error('Invalid import history.');
  if(data.milestones.some(m=>!normalizeDate(m.date)||![m.target,m.saved,m.monthly].every(v=>Number.isSafeInteger(v)&&v>=0)||!Number.isFinite(m.rate)||m.rate < -99 || m.rate>100 || !Number.isFinite(m.inflation)||m.inflation<0||m.inflation>100))throw new Error('Invalid timeline data.');
  return data;
}
