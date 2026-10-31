import * as C from './core.js';
import {esc,icon,money,amountValue,dateLabel,option,button,empty,stat} from './ui.js';
import {defaultPlanning,validatePlanning,investmentPlanned,investmentActual,valuationPivot,componentSummary,latestLoanStatus} from './planning-model.js';
export {defaultPlanning,validatePlanning,investmentPlanned,investmentActual,valuationPivot,componentSummary,latestLoanStatus};

export const planningDraftKinds=['planning-valuation','planning-investment','planning-actual','planning-cost','planning-repayment','planning-status','planning-option'];
const groups={accountTypes:'Account types',subtypes:'Subtypes',valuationCategories:'Valuation categories',investmentTypes:'Investment types'};
const dimensions={accountType:'Account type',subtype:'Subtype',category:'Category',month:'Month / year',year:'Year'};
const field=(label,name,type='text',value='',extra='')=>`<label class="field">${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select=(label,name,options,extra='')=>`<label class="field">${esc(label)}<select name="${name}" ${extra}>${options}</select></label>`;
const number=(label,name,value=0)=>field(label,name,'number',amountValue(value),'required min="0" max="999999999999.99" step="0.01" inputmode="decimal" data-money');
const percent=value=>field('Percentage','percentage','number',value??0,'required min="0" max="100" step="0.0001"');
const currencyOptions=value=>['INR','CHF','USD'].map(x=>option(x,x,value)).join('');
const picker=(items,selected)=>items.map(x=>option(x.id,x.name,selected)).join('');
const currencyField=value=>select('Currency','currency',currencyOptions(value),'required');
const head=(title,subtitle,actions)=>`<div class="page-head"><div><div class="eyebrow">YOUR MONEY & PLANS</div><h1>${esc(title)}</h1><p class="subtitle">${esc(subtitle)}</p></div><div class="actions">${actions}</div></div>`;
const action=(name,label,id='',glyph='edit')=>button(name,label,glyph,'secondary',`data-id="${esc(id)}"`);
const edit=(kind,id,label='Edit')=>action('planning-edit',label,kind+':'+id);
const remove=(group,id)=>action('planning-delete','Delete',group+':'+id,'trash');
const table=(headers,rows)=>`<div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const td=(value,cls='')=>`<td${cls?` class="${cls}"`:''}>${esc(value)}</td>`;
const cash=(value,currency)=>money(value,currency,2);
const name=(items,id)=>items.find(x=>x.id===id)?.name||'—';
const hidden=(kind,id)=>`<input type="hidden" name="planningKind" value="${esc(kind)}"><input type="hidden" name="planningId" value="${esc(id)}">`;
const pData=data=>data.planning||defaultPlanning();
const state=ui=>({investmentMode:'month',investmentMonth:C.today().slice(0,7),investmentYear:C.today().slice(0,4),pivotRow:'accountType',pivotColumn:'month',pivotMeasure:'value',...ui});
function optionManager(p,keys) {
  return `<details class="planning-options card pad"><summary>Manage ${keys.map(k=>groups[k].toLowerCase()).join(', ')}</summary><div class="grid cols2">${keys.map(key=>`<section><div class="section-title"><h3>${groups[key]}</h3>${action('planning-add-option','Add',key,'plus')}</div><div class="chips">${p[key].map(x=>action('planning-edit-option',x.name+(key==='subtypes'?' · '+name(p.accountTypes,x.parentId):''),key+':'+x.id)).join('')||'<span class="hint">No options yet</span>'}</div></section>`).join('')}</div></details>`;
}
function pivotTable(p,s,currency) {
  const pivot=valuationPivot(p,{row:s.pivotRow,column:s.pivotColumn,measure:s.pivotMeasure,currency});
  const value=x=>s.pivotMeasure==='count'?String(x):cash(x,currency);
  if (!pivot.rows.length) return empty('Create your first valuation','The pivot will summarize values in the selected currency.');
  return table([dimensions[s.pivotRow],...pivot.columns,'Grand total'],[
    ...pivot.rows.map(row=>`<tr>${td(row)}${pivot.columns.map(col=>td(value(pivot.get(row,col)),'numeric')).join('')}${td(value(pivot.columns.reduce((sum,col)=>sum+pivot.get(row,col),0)),'numeric')}</tr>`),
    `<tr>${td('Grand total')}${pivot.columns.map(col=>td(value(pivot.rows.reduce((sum,row)=>sum+pivot.get(row,col),0)),'numeric')).join('')}${td(value(pivot.total),'numeric')}</tr>`
  ]);
}
function renderValuation(data,ui) {
  const p=pData(data),s=state(ui),currency=data.settings.currency,rows=p.valuations.filter(x=>x.currency===currency).sort((a,b)=>b.month.localeCompare(a.month));
  const dimOptions=selected=>Object.entries(dimensions).map(([key,label])=>option(key,label,selected)).join('');
  return head('Valuation','Record the value of your accounts each month and build a pivot.',button('planning-add-valuation','Add valuation'))+
    optionManager(p,['accountTypes','subtypes','valuationCategories'])+
    `<section class="card planning-section"><div class="card-head"><div><h2>Monthly valuations</h2><p>${currency} only · ${rows.length} rows</p></div></div>${rows.length?table(['Account type','Subtype','Month','Year','Category','Value',''],rows.map(x=>`<tr>${td(name(p.accountTypes,x.accountTypeId))}${td(name(p.subtypes,x.subtypeId))}${td(x.month.slice(5))}${td(x.month.slice(0,4))}${td(name(p.valuationCategories,x.categoryId))}${td(cash(x.value,currency),'numeric')}<td>${edit('planning-valuation',x.id)}</td></tr>`)):empty('Your monthly account values','Add an account type and subtype, then record a valuation.','planning-add-valuation','Add valuation')}</section>`+
    `<section class="card planning-section"><div class="card-head"><div><h2>Valuation pivot</h2><p>Group your records by account, category or time. Amounts remain in ${currency}.</p></div>${action('planning-export-pivot','Export CSV','','download')}</div><div class="planning-pivot-controls">${select('Rows','pivotRow',dimOptions(s.pivotRow),'data-planning="pivotRow"')}${select('Columns','pivotColumn',option('','Total',s.pivotColumn)+dimOptions(s.pivotColumn),'data-planning="pivotColumn"')}${select('Measure','pivotMeasure',option('value','Sum of value',s.pivotMeasure)+option('count','Number of records',s.pivotMeasure),'data-planning="pivotMeasure"')}</div>${pivotTable(p,s,currency)}<p class="hint planning-note">Values are snapshots. A pivot across months sums those recorded snapshots.</p></section>`;
}
function renderInvestments(data,ui) {
  const p=pData(data),s=state(ui),currency=data.settings.currency,period=s.investmentMode==='year'?s.investmentYear:s.investmentMonth,rows=p.investments.filter(x=>x.currency===currency);
  const sum=(fn,key)=>rows.reduce((total,x)=>total+fn(x,key),0);
  const year=s.investmentMode==='year'?s.investmentYear:s.investmentMonth.slice(0,4);
  const controls=`<div class="filters"><div class="segmented"><button type="button" data-action="planning-investment-month" class="${s.investmentMode==='month'?'selected':''}">Month view</button><button type="button" data-action="planning-investment-year" class="${s.investmentMode==='year'?'selected':''}">Year view</button></div>${s.investmentMode==='month'?field('Month','investmentMonth','month',s.investmentMonth,'data-planning="investmentMonth" required'):field('Year','investmentYear','number',s.investmentYear,'data-planning="investmentYear" required min="1900" max="9999" step="1"')}<span class="hint">One contribution per active calendar month, including start and end months.</span></div>`;
  return head('Investment plan','Plan monthly contributions and record what you actually invest.',button('planning-add-investment','Add investment option'))+
    optionManager(p,['investmentTypes'])+controls+
    `<div class="grid cols3 stats">${stat('Planned for '+period,cash(sum(investmentPlanned,period),currency),'Active plans in '+currency,'wallet',true)}${stat('Planned for '+year,cash(sum(investmentPlanned,year),currency),'Includes only active months','timeline')}${stat('Actually invested · '+period,cash(sum(investmentActual,period),currency),'Recorded monthly amounts','check')}</div>`+
    `<section class="card planning-section">${rows.length?table(['Investment type','Details','Account number','Start date','End date','Planned / '+(s.investmentMode==='month'?'month':'year'),'Actual amount invested',''],rows.map(x=>`<tr>${td(name(p.investmentTypes,x.typeId))}${td(x.details||'—')}${td(x.accountNumber||'—')}${td(dateLabel(x.startDate,data.settings.dateFormat))}${td(x.endDate?dateLabel(x.endDate,data.settings.dateFormat):'Ongoing')}${td(cash(investmentPlanned(x,period),currency),'numeric')}<td class="numeric">${esc(cash(investmentActual(x,period),currency))}<br>${action('planning-actual','Record actual',x.id,'plus')}</td><td>${edit('planning-investment',x.id)}</td></tr>`)):empty('Make an investment plan','Add an investment option with its monthly amount and dates.','planning-add-investment','Add investment option')}<div class="card-foot"><span>${rows.length} investment options · ${currency} · ${esc(period)}</span><strong>Planned ${esc(cash(sum(investmentPlanned,period),currency))} · Actual ${esc(cash(sum(investmentActual,period),currency))}</strong></div></section>`;
}
function renderHomeLoan(data) {
  const p=pData(data),currency=data.settings.currency,costs=p.costs.filter(x=>x.currency===currency),repayments=p.repayments.filter(x=>x.currency===currency).sort((a,b)=>a.sequence-b.sequence),statuses=p.loanStatuses.filter(x=>x.currency===currency).sort((a,b)=>b.asOn.localeCompare(a.asOn)),summary=componentSummary(p,currency),latest=latestLoanStatus(p,currency);
  const sum=(rows,key)=>rows.reduce((s,x)=>s+x[key],0);
  return head('Home loan','Track property costs, payment demands and dated loan balances.',button('planning-add-cost','Add cost'))+
    `<section class="card planning-section"><div class="card-head"><div><h2>1. Cost</h2><p>Record planned and actual costs by component · ${currency}</p></div>${action('planning-add-cost','Add cost','','plus')}</div>${costs.length?table(['Component','Type','Percentage','To pay','Actually paid',''],costs.map(x=>`<tr>${td(x.component)}${td(x.type)}${td(x.percentage+'%')}${td(cash(x.toPay,currency),'numeric')}${td(cash(x.paid,currency),'numeric')}<td>${edit('planning-cost',x.id)}</td></tr>`)):empty('Add your property costs','Record each component and the amounts planned and paid.','planning-add-cost','Add cost')}<div class="card-head"><h3>Cost summary by component</h3></div>${table(['Component','To pay','Actually paid','Balance'],[...summary.map(x=>`<tr>${td(x.component)}${td(cash(x.toPay,currency),'numeric')}${td(cash(x.paid,currency),'numeric')}${td(cash(x.balance,currency),'numeric')}</tr>`),`<tr>${td('Total')}${td(cash(sum(costs,'toPay'),currency),'numeric')}${td(cash(sum(costs,'paid'),currency),'numeric')}${td(cash(sum(costs,'toPay')-sum(costs,'paid'),currency),'numeric')}</tr>`])}</section>`+
    `<section class="card planning-section"><div class="card-head"><div><h2>2. Repayment schedule</h2><p>Agreement amounts, demands and actual payments · ${currency}</p></div>${action('planning-add-repayment','Add payment','','plus')}</div>${repayments.length?table(['Sr. No.','Payment type','Agreement value','%','Amount to pay','Demand','Actually paid','Comment',''],repayments.map(x=>`<tr>${td(x.sequence)}${td(x.paymentType)}${td(cash(x.agreementValue,currency),'numeric')}${td(x.percentage+'%')}${td(cash(x.toPay,currency),'numeric')}${td(cash(x.demand,currency),'numeric')}${td(cash(x.paid,currency),'numeric')}${td(x.comment||'—')}<td>${edit('planning-repayment',x.id)}</td></tr>`)):empty('Build your repayment schedule','Add each scheduled payment and its demand amount.','planning-add-repayment','Add payment')}<div class="card-foot"><span>Total to pay ${esc(cash(sum(repayments,'toPay'),currency))} · Demand ${esc(cash(sum(repayments,'demand'),currency))}</span><strong>Paid ${esc(cash(sum(repayments,'paid'),currency))}</strong></div></section>`+
    `<section class="card planning-section"><div class="card-head"><div><h2>3. Loan status</h2><p>Dated snapshots, with cumulative principal and interest paid · ${currency}</p></div>${action('planning-add-status','Add status','','plus')}</div>${statuses.length?table(['As on date','Amount approved','Amount disbursed','Principal paid','Interest paid',''],statuses.map(x=>`<tr>${td(dateLabel(x.asOn,data.settings.dateFormat))}${td(cash(x.approved,currency),'numeric')}${td(cash(x.disbursed,currency),'numeric')}${td(cash(x.principalPaid,currency),'numeric')}${td(cash(x.interestPaid,currency),'numeric')}<td>${edit('planning-status',x.id)}</td></tr>`)):empty('Record your loan balance','Keep approved, disbursed, principal and interest figures as of a date.','planning-add-status','Add status')}</section>`+
    `<section class="card planning-section"><div class="card-head"><div><h2>4. Summary</h2><p>${latest?'Loan figures use the latest snapshot: '+dateLabel(latest.asOn,data.settings.dateFormat):'Add a loan status to see the latest balance.'}</p></div></div>${table(['Measure','Amount · '+currency],[['Total cost',sum(costs,'toPay')],['Cost actually paid',sum(costs,'paid')],['Cost balance',sum(costs,'toPay')-sum(costs,'paid')],['Scheduled payments',sum(repayments,'toPay')],['Payment demands',sum(repayments,'demand')],['Schedule actually paid',sum(repayments,'paid')],['Schedule balance',sum(repayments,'toPay')-sum(repayments,'paid')],['Loan approved',latest?.approved??null],['Loan disbursed',latest?.disbursed??null],['Undisbursed approval',latest?latest.approved-latest.disbursed:null],['Principal paid',latest?.principalPaid??null],['Interest paid',latest?.interestPaid??null],['Outstanding principal',latest?latest.disbursed-latest.principalPaid:null]].map(([label,value])=>`<tr>${td(label)}${td(value===null?'—':cash(value,currency),'numeric')}</tr>`))}<p class="hint planning-note">Cost and repayment totals are shown separately. Status snapshots are cumulative and are never added together.</p></section>`;
}
export function renderPlanning(view,data,ui={}) {
  return view==='valuation'?renderValuation(data,ui):view==='investments'?renderInvestments(data,ui):renderHomeLoan(data);
}

export function planningEditor(kind,id,ctx) {
  const data=ctx.data(),p=pData(data),currency=data.settings.currency;
  let x={},title='',body='',removeGroup='';
  if (kind==='planning-option') {
    const [group,optionId]=String(id||'accountTypes').split(':');
    if (!groups[group]) throw new Error('Choose a valid option list.');
    x=p[group].find(x=>x.id===optionId)||{};title=(x.id?'Edit ':'Add ')+groups[group].toLowerCase();
    body=hidden(kind,id)+field('Name','name','text',x.name||'','required maxlength="160"')+(group==='subtypes'?select('Account type','parentId',picker(p.accountTypes,x.parentId),'required'):'')+(x.id?remove(group,x.id):'');
  } else if (kind==='planning-valuation') {
    x=p.valuations.find(x=>x.id===id)||{};title=x.id?'Edit valuation':'Add valuation';removeGroup='valuations';
    const type=x.accountTypeId||p.accountTypes[0]?.id,month=x.month||C.today().slice(0,7),year=month.slice(0,4),years=[...new Set([year,...Array.from({length:31},(_,i)=>String(+C.today().slice(0,4)-10+i))])].sort();
    body=select('Account type','accountTypeId',picker(p.accountTypes,type),'required data-planning="valuationAccountType"')+select('Subtype','subtypeId',picker(p.subtypes.filter(s=>s.parentId===type),x.subtypeId),'required')+select('Month','month',Array.from({length:12},(_,i)=>option(String(i+1).padStart(2,'0'),new Date(2020,i,1).toLocaleDateString('en-GB',{month:'long'}),month.slice(5))).join(''),'required')+select('Year','year',years.map(y=>option(y,y,year)).join(''),'required')+select('Category','categoryId',picker(p.valuationCategories,x.categoryId),'required')+number('Value','value',x.value??0)+currencyField(x.currency||currency);
  } else if (kind==='planning-investment') {
    x=p.investments.find(x=>x.id===id)||{};title=x.id?'Edit investment option':'Add investment option';removeGroup='investments';
    body=select('Investment type','typeId',picker(p.investmentTypes,x.typeId),'required')+field('Details','details','text',x.details||'','maxlength="1000"')+field('Account number','accountNumber','text',x.accountNumber||'','maxlength="160" autocomplete="off"')+field('Start date','startDate','date',x.startDate||C.today(),'required')+field('End date (optional)','endDate','date',x.endDate||'')+number('Amount per month','monthly',x.monthly??0)+currencyField(x.currency||currency);
  } else if (kind==='planning-actual') {
    x=p.investments.find(x=>x.id===id);if(!x)throw new Error('This investment no longer exists.');title='Actual amount invested';
    const s=state(ctx.ui),month=s.investmentMode==='year'?s.investmentYear+'-'+s.investmentMonth.slice(5):s.investmentMonth;
    body=`<p class="modal-intro span2">${esc(name(p.investmentTypes,x.typeId))} · ${esc(x.details)} · ${x.currency}. Enter the actual total for one month. Saving again replaces that month’s total.</p>`+field('Month','month','month',month,'required data-planning="actualMonth"')+number('Actual amount invested','amount',x.actuals.find(a=>a.month===month)?.amount??0)+`<div class="span2">${table(['Month','Actually invested',''],[...x.actuals].sort((a,b)=>b.month.localeCompare(a.month)).map(a=>`<tr>${td(a.month)}${td(cash(a.amount,x.currency))}<td>${action('planning-delete-actual','Delete',x.id+':'+a.month,'trash')}</td></tr>`))}</div>`;
  } else if (kind==='planning-cost') {
    x=p.costs.find(x=>x.id===id)||{};title=x.id?'Edit cost':'Add cost';removeGroup='costs';
    body=field('Component','component','text',x.component||'','required maxlength="160"')+field('Type','type','text',x.type||'','required maxlength="160"')+percent(x.percentage)+number('To pay','toPay',x.toPay??0)+number('Actually paid','paid',x.paid??0)+currencyField(x.currency||currency);
  } else if (kind==='planning-repayment') {
    x=p.repayments.find(x=>x.id===id)||{};title=x.id?'Edit scheduled payment':'Add scheduled payment';removeGroup='repayments';
    let next=1;for (const row of p.repayments) if(row.currency===currency)next=Math.max(next,row.sequence+1);
    body=field('Sr. No.','sequence','number',x.sequence||next,'required min="1" max="1000000" step="1"')+field('Payment type','paymentType','text',x.paymentType||'','required maxlength="160"')+number('Agreement value','agreementValue',x.agreementValue??0)+percent(x.percentage)+number('Amount to pay','toPay',x.toPay??0)+number('Demand amount','demand',x.demand??0)+number('Actually paid','paid',x.paid??0)+field('Comment','comment','text',x.comment||'','maxlength="2000"')+currencyField(x.currency||currency)+`<p class="hint span2">Percentage is recorded for reference. Enter the actual amount to pay and demand amount from your agreement.</p>`;
  } else if (kind==='planning-status') {
    x=p.loanStatuses.find(x=>x.id===id)||{};title=x.id?'Edit loan status':'Add loan status';removeGroup='loanStatuses';
    body=field('As on date','asOn','date',x.asOn||C.today(),'required')+number('Amount approved','approved',x.approved??0)+number('Amount disbursed','disbursed',x.disbursed??0)+number('Principal paid (cumulative)','principalPaid',x.principalPaid??0)+number('Interest paid (cumulative)','interestPaid',x.interestPaid??0)+currencyField(x.currency||currency);
  } else return false;
  if (kind!=='planning-option') body=hidden(kind,id||'')+body+(x.id&&removeGroup?`<div class="span2">${remove(removeGroup,x.id)}</div>`:'');
  ctx.open(kind,id||'',title,`<div class="form-grid">${body}</div>`,{submit:'Save changes'});
  return true;
}
const ensure=data=>data.planning||(data.planning=defaultPlanning());
function put(p,group,item) {const index=p[group].findIndex(x=>x.id===item.id);if(index<0)p[group].push(item);else p[group][index]=item;}
function optionUsed(p,group,id) {
  return group==='accountTypes'?p.subtypes.some(x=>x.parentId===id)||p.valuations.some(x=>x.accountTypeId===id):group==='subtypes'?p.valuations.some(x=>x.subtypeId===id):group==='valuationCategories'?p.valuations.some(x=>x.categoryId===id):group==='investmentTypes'?p.investments.some(x=>x.typeId===id):false;
}
export async function handlePlanningAction(actionName,element,ctx) {
  if (!actionName.startsWith('planning-')) return false;
  const id=typeof element==='string'?element:element?.dataset?.id||'';
  const addKinds={'planning-add-valuation':'planning-valuation','planning-add-investment':'planning-investment','planning-add-cost':'planning-cost','planning-add-repayment':'planning-repayment','planning-add-status':'planning-status'};
  if (addKinds[actionName])planningEditor(addKinds[actionName],'',ctx);
  else if (actionName==='planning-add-option'||actionName==='planning-edit-option')planningEditor('planning-option',id||element?.dataset?.group,ctx);
  else if (actionName==='planning-edit') {const index=id.indexOf(':');planningEditor(id.slice(0,index),id.slice(index+1),ctx);}
  else if (actionName==='planning-actual')planningEditor('planning-actual',id,ctx);
  else if (actionName==='planning-investment-month'||actionName==='planning-investment-year') {ctx.ui.investmentMode=actionName.endsWith('year')?'year':'month';ctx.render();}
  else if (actionName==='planning-delete') {
    const [group,itemId]=id.split(':'),p=pData(ctx.data());
    if (!Array.isArray(p[group]))throw new Error('This planning item no longer exists.');
    if (optionUsed(p,group,itemId))throw new Error('This option is in use. Reassign its records before deleting it.');
    if (await ctx.confirm('Delete this '+(groups[group]?'option':'record')+'?')) {await ctx.mutate(d=>{const p=ensure(d);p[group]=p[group].filter(x=>x.id!==itemId);validatePlanning(p);});ctx.close();ctx.render();}
  } else if (actionName==='planning-delete-actual') {
    const [investmentId,month]=id.split(':');
    if (await ctx.confirm('Delete the actual amount recorded for '+month+'?')) {await ctx.mutate(d=>{const p=ensure(d),x=p.investments.find(x=>x.id===investmentId);if(x)x.actuals=x.actuals.filter(a=>a.month!==month);});planningEditor('planning-actual',investmentId,ctx);ctx.render();}
  } else if (actionName==='planning-export-pivot') {
    const data=ctx.data(),s=state(ctx.ui),p=valuationPivot(pData(data),{row:s.pivotRow,column:s.pivotColumn,measure:s.pivotMeasure,currency:data.settings.currency}),unit=s.pivotMeasure==='count'?1:100;
    await ctx.download('valuation-pivot-'+data.settings.currency+'.csv',C.toCSV([[dimensions[s.pivotRow],...p.columns,'Grand total','Currency'],...p.rows.map(row=>[row,...p.columns.map(col=>p.get(row,col)/unit),p.columns.reduce((sum,col)=>sum+p.get(row,col),0)/unit,data.settings.currency]),['Grand total',...p.columns.map(col=>p.rows.reduce((sum,row)=>sum+p.get(row,col),0)/unit),p.total/unit,data.settings.currency]]));
  } else return false;
  return true;
}
export async function handlePlanningSubmit(form,ctx) {
  const f=new FormData(form),kind=String(f.get('planningKind')||'');
  if (!planningDraftKinds.includes(kind)) return false;
  const v=key=>String(f.get(key)||'').trim(),id=v('planningId')||C.uid(),amount=key=>{
    if (!v(key))throw new Error('Enter '+key+' as an amount.');
    const value=C.moneyInput(v(key));if(!Number.isSafeInteger(value)||value<0||value>=1e14)throw new Error('Enter nonnegative amounts with at most two decimal places.');return value;
  };
  const required=key=>{const value=v(key);if(!value)throw new Error('Enter '+key+'.');return value;};
  const rate=()=>{const raw=v('percentage'),n=Number(raw);if(!raw||!Number.isFinite(n)||n<0||n>100)throw new Error('Percentage must be from 0 to 100.');return n;};
  await ctx.mutate(data=>{
    const p=ensure(data),currency=v('currency');
    if (kind==='planning-option') {
      const [group,itemId]=v('planningId').split(':');if(!groups[group])throw new Error('Choose an option list.');
      const value=required('name');if(p[group].some(x=>x.id!==itemId&&x.name.toLowerCase()===value.toLowerCase()&&(group!=='subtypes'||x.parentId===v('parentId'))))throw new Error('This option already exists.');
      if (group==='subtypes'&&p.valuations.some(x=>x.subtypeId===itemId&&x.accountTypeId!==v('parentId')))throw new Error('This subtype is used by valuations under its current account type. Reassign those valuations first.');
      put(p,group,{id:itemId||C.uid(),name:value,...(group==='subtypes'?{parentId:v('parentId')}:{} )});
    } else if (kind==='planning-valuation')put(p,'valuations',{id,accountTypeId:v('accountTypeId'),subtypeId:v('subtypeId'),categoryId:v('categoryId'),month:v('year')+'-'+v('month'),value:amount('value'),currency});
    else if (kind==='planning-investment') {
      const previous=p.investments.find(x=>x.id===id);
      if(previous&&previous.currency!==currency&&previous.actuals.length)throw new Error('This investment has actual amounts. Keep its currency or remove those amounts before changing currency.');
      put(p,'investments',{id,typeId:v('typeId'),details:v('details'),accountNumber:v('accountNumber'),startDate:v('startDate'),endDate:v('endDate'),monthly:amount('monthly'),currency,actuals:previous?.actuals||[]});
    } else if (kind==='planning-actual') {
      const x=p.investments.find(x=>x.id===id);if(!x)throw new Error('This investment no longer exists.');
      x.actuals=x.actuals.filter(a=>a.month!==v('month'));x.actuals.push({month:v('month'),amount:amount('amount')});
    } else if (kind==='planning-cost')put(p,'costs',{id,component:required('component'),type:required('type'),percentage:rate(),toPay:amount('toPay'),paid:amount('paid'),currency});
    else if (kind==='planning-repayment')put(p,'repayments',{id,sequence:Number(v('sequence')),paymentType:required('paymentType'),agreementValue:amount('agreementValue'),percentage:rate(),toPay:amount('toPay'),demand:amount('demand'),paid:amount('paid'),comment:v('comment'),currency});
    else if (kind==='planning-status')put(p,'loanStatuses',{id,asOn:v('asOn'),approved:amount('approved'),disbursed:amount('disbursed'),principalPaid:amount('principalPaid'),interestPaid:amount('interestPaid'),currency});
    validatePlanning(p);
  });
  ctx.close();ctx.render();return true;
}
export function handlePlanningChange(target,ctx) {
  const key=target.dataset.planning;if(!key)return false;
  if (key==='valuationAccountType') {
    const form=target.closest('form'),select=form.querySelector('[name=subtypeId]'),p=pData(ctx.data());
    select.innerHTML=picker(p.subtypes.filter(x=>x.parentId===target.value),select.value);
  } else if (key==='actualMonth') {
    const form=target.closest('form'),x=pData(ctx.data()).investments.find(x=>x.id===form.elements.planningId.value);
    form.elements.amount.value=amountValue(x?.actuals.find(a=>a.month===target.value)?.amount??0);
  } else if (['investmentMonth','investmentYear','pivotRow','pivotColumn','pivotMeasure'].includes(key)) {
    if(!target.validity.valid||!target.value&&key!=='pivotColumn')return true;
    ctx.ui[key]=target.value;ctx.render();
  } else return false;
  return true;
}

// Restoring form values does not dispatch change events. Rebuild dependent options
// before assigning the saved subtype, and retain an older year absent from defaults.
export function restorePlanningDraft(form,values,ctx) {
  const value=key=>values?.find(x=>x.name===key)?.value;
  if (value('planningKind')!=='planning-valuation')return;
  const parent=value('accountTypeId'),subtype=form.querySelector('[name=subtypeId]'),year=form.querySelector('[name=year]');
  if(subtype)subtype.innerHTML=picker(pData(ctx.data()).subtypes.filter(x=>x.parentId===parent),value('subtypeId'));
  if(year&&value('year')&&![...year.options].some(x=>x.value===value('year')))year.insertAdjacentHTML('beforeend',option(value('year'),value('year'),value('year')));
}
