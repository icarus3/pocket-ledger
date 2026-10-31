// Planning data is optional in older encrypted ledgers. All amounts are minor units.
const currencies = ['INR','CHF','USD'];
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const dateValid = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
};
const amountValid = value => Number.isSafeInteger(value) && value >= 0 && value < 1e14;
const percentValid = value => Number.isFinite(value) && value >= 0 && value <= 100;
const textValid = value => typeof value === 'string';
const nonempty = value => textValid(value) && !!value.trim();

export function defaultPlanning() {
  return {
    accountTypes:[{id:'bank',name:'Bank account'},{id:'investment',name:'Investment account'}],
    subtypes:[{id:'savings',name:'Savings',parentId:'bank'},{id:'portfolio',name:'Portfolio',parentId:'investment'}],
    valuationCategories:[{id:'asset',name:'Asset'},{id:'liability',name:'Liability'}],
    investmentTypes:[{id:'mutual-fund',name:'Mutual fund'},{id:'deposit',name:'Recurring deposit'}],
    valuations:[],investments:[],costs:[],repayments:[],loanStatuses:[]
  };
}

export function validatePlanning(p) {
  if (p === undefined) return p;
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Invalid planning data.');
  for (const group of ['accountTypes','subtypes','valuationCategories','investmentTypes','valuations','investments','costs','repayments','loanStatuses']) {
    if (!Array.isArray(p[group])) throw new Error('Invalid planning '+group+'.');
    const ids = new Set();
    for (const item of p[group]) {
      if (!item || !nonempty(item.id) || ids.has(item.id)) throw new Error('Invalid planning identifiers.');
      ids.add(item.id);
    }
  }
  for (const group of ['accountTypes','subtypes','valuationCategories','investmentTypes'])
    if (p[group].some(x=>!nonempty(x.name))) throw new Error('Invalid planning options.');
  const has = (group,id) => p[group].some(x=>x.id===id);
  if (p.subtypes.some(x=>!has('accountTypes',x.parentId))) throw new Error('Invalid account subtype parent.');
  if (p.valuations.some(x=>!currencies.includes(x.currency)||!monthPattern.test(x.month)||!amountValid(x.value)||!has('accountTypes',x.accountTypeId)||!p.subtypes.some(s=>s.id===x.subtypeId&&s.parentId===x.accountTypeId)||!has('valuationCategories',x.categoryId))) throw new Error('Invalid valuation data.');
  for (const x of p.investments) {
    if (!currencies.includes(x.currency)||!has('investmentTypes',x.typeId)||!textValid(x.details)||!textValid(x.accountNumber)||!dateValid(x.startDate)||!textValid(x.endDate)||(x.endDate&&(!dateValid(x.endDate)||x.endDate<x.startDate))||!amountValid(x.monthly)||!Array.isArray(x.actuals)) throw new Error('Invalid investment data.');
    const months = new Set();
    for (const a of x.actuals) {
      if (!a || !monthPattern.test(a.month)||!amountValid(a.amount)||months.has(a.month)) throw new Error('Invalid actual investment data.');
      months.add(a.month);
    }
  }
  if (p.costs.some(x=>!currencies.includes(x.currency)||!nonempty(x.component)||!nonempty(x.type)||!percentValid(x.percentage)||![x.toPay,x.paid].every(amountValid))) throw new Error('Invalid home loan costs.');
  if (p.repayments.some(x=>!currencies.includes(x.currency)||!Number.isSafeInteger(x.sequence)||x.sequence<1||!nonempty(x.paymentType)||!textValid(x.comment)||!percentValid(x.percentage)||![x.agreementValue,x.toPay,x.demand,x.paid].every(amountValid))) throw new Error('Invalid repayment schedule.');
  if (p.loanStatuses.some(x=>!currencies.includes(x.currency)||!dateValid(x.asOn)||![x.approved,x.disbursed,x.principalPaid,x.interestPaid].every(amountValid))) throw new Error('Invalid loan status.');
  return p;
}

// A monthly plan contributes once in every calendar month touched by its dates.
// Year totals intersect the active range rather than multiplying a partial year by 12.
export function investmentPlanned(investment, period) {
  const first=investment.startDate.slice(0,7), last=investment.endDate?.slice(0,7)||'9999-12';
  if (monthPattern.test(period)) return period>=first&&period<=last ? investment.monthly : 0;
  if (!/^\d{4}$/.test(period)) return 0;
  let total=0;
  for (let month=1;month<=12;month++) {
    const key=period+'-'+String(month).padStart(2,'0');
    if (key>=first&&key<=last) total+=investment.monthly;
  }
  return total;
}
export function investmentActual(investment, period) {
  return investment.actuals.filter(a=>a.month===period||(period.length===4&&a.month.startsWith(period+'-'))).reduce((s,a)=>s+a.amount,0);
}
export function valuationPivot(p, {row='accountType',column='month',measure='value',currency='INR'}={}) {
  const dimensions={accountType:x=>p.accountTypes.find(a=>a.id===x.accountTypeId)?.name||'Unknown',subtype:x=>(p.subtypes.find(a=>a.id===x.subtypeId)?.name||'Unknown')+' · '+(p.accountTypes.find(a=>a.id===x.accountTypeId)?.name||'Unknown'),category:x=>p.valuationCategories.find(a=>a.id===x.categoryId)?.name||'Unknown',month:x=>x.month,year:x=>x.month.slice(0,4)};
  const cells=new Map(), rows=new Set(), columns=new Set();
  let total=0;
  for (const x of p.valuations) {
    if (x.currency!==currency) continue;
    const r=(dimensions[row]||dimensions.accountType)(x), c=column?(dimensions[column]||dimensions.month)(x):'Total',value=measure==='count'?1:x.value;
    rows.add(r);columns.add(c);total+=value;
    const key=JSON.stringify([r,c]);cells.set(key,(cells.get(key)||0)+value);
  }
  return {rows:[...rows].sort(),columns:[...columns].sort(),total,get:(r,c)=>cells.get(JSON.stringify([r,c]))||0};
}
export function componentSummary(p,currency) {
  const groups=new Map();
  for (const x of p.costs) {
    if (x.currency!==currency) continue;
    const key=x.component.trim(),row=groups.get(key)||{component:key,toPay:0,paid:0};
    row.toPay+=x.toPay;row.paid+=x.paid;groups.set(key,row);
  }
  return [...groups.values()].map(x=>({...x,balance:x.toPay-x.paid}));
}
export function latestLoanStatus(p,currency) {
  let latest=null;
  for (const x of p.loanStatuses) if (x.currency===currency&&(!latest||x.asOn>=latest.asOn)) latest=x;
  return latest;
}
