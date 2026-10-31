import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultPlanning,validatePlanning,investmentPlanned,investmentActual,valuationPivot,componentSummary,latestLoanStatus} from '../src/planning-model.js';

const investment=()=>({id:'i',typeId:'mutual-fund',details:'Monthly savings',accountNumber:'001234',startDate:'2026-03-15',endDate:'2026-05-03',monthly:10001,currency:'INR',actuals:[{month:'2026-03',amount:9999},{month:'2026-04',amount:12000},{month:'2027-03',amount:5000}]});
test('legacy ledgers without planning remain valid and defaults are independent',()=>{
  assert.equal(validatePlanning(undefined),undefined);
  const a=defaultPlanning(),b=defaultPlanning();a.accountTypes[0].name='Changed';
  assert.equal(b.accountTypes[0].name,'Bank account');assert.equal(validatePlanning(b),b);
  assert.throws(()=>validatePlanning(null),/Invalid planning/);
});
test('investment plans count inclusive active months and partial years exactly',()=>{
  const i=investment();
  assert.equal(investmentPlanned(i,'2026-02'),0);assert.equal(investmentPlanned(i,'2026-03'),10001);assert.equal(investmentPlanned(i,'2026-05'),10001);assert.equal(investmentPlanned(i,'2026-06'),0);
  assert.equal(investmentPlanned(i,'2026'),30003);assert.equal(investmentPlanned(i,'2027'),0);
  i.startDate='2025-11-30';i.endDate='2026-02-01';
  assert.equal(investmentPlanned(i,'2025'),20002);assert.equal(investmentPlanned(i,'2026'),20002);
  i.endDate='';assert.equal(investmentPlanned(i,'2027'),120012);
});
test('actual investment amounts are recorded per month and aggregate by year',()=>{
  const i=investment();assert.equal(investmentActual(i,'2026-03'),9999);assert.equal(investmentActual(i,'2026'),21999);assert.equal(investmentActual(i,'2027'),5000);assert.equal(investmentActual(i,'2025'),0);
  const p=defaultPlanning();p.investments.push(i);assert.equal(validatePlanning(p),p);
  i.actuals.push({month:'2026-03',amount:1});assert.throws(()=>validatePlanning(p),/actual investment/);
});
test('valuation pivot keeps currency separate and supports count, year and total columns',()=>{
  const p=defaultPlanning();
  p.valuations=[{id:'v1',accountTypeId:'bank',subtypeId:'savings',categoryId:'asset',month:'2026-03',value:10001,currency:'INR'},{id:'v2',accountTypeId:'bank',subtypeId:'savings',categoryId:'asset',month:'2026-04',value:12002,currency:'INR'},{id:'v3',accountTypeId:'bank',subtypeId:'savings',categoryId:'asset',month:'2026-03',value:99000,currency:'USD'}];
  const byYear=valuationPivot(p,{row:'accountType',column:'year',currency:'INR'});
  assert.deepEqual(byYear.rows,['Bank account']);assert.deepEqual(byYear.columns,['2026']);assert.equal(byYear.get('Bank account','2026'),22003);assert.equal(byYear.total,22003);
  const count=valuationPivot(p,{row:'category',column:'',measure:'count',currency:'INR'});
  assert.deepEqual(count.columns,['Total']);assert.equal(count.get('Asset','Total'),2);
  assert.equal(valuationPivot(p,{currency:'USD'}).total,99000);assert.equal(validatePlanning(p),p);
});
test('home loan summaries group costs and use latest cumulative snapshot per currency',()=>{
  const p=defaultPlanning();
  p.costs=[{id:'c1',component:'Registration',type:'Tax',percentage:5,toPay:10001,paid:3000,currency:'INR'},{id:'c2',component:'Registration',type:'Fee',percentage:0,toPay:2002,paid:1000,currency:'INR'},{id:'c3',component:'Registration',type:'Fee',percentage:0,toPay:99999,paid:99999,currency:'USD'}];
  assert.deepEqual(componentSummary(p,'INR'),[{component:'Registration',toPay:12003,paid:4000,balance:8003}]);
  const status=(id,asOn,disbursed,currency='INR')=>({id,asOn,approved:200000,disbursed,principalPaid:10000,interestPaid:2000,currency});
  p.loanStatuses=[status('s1','2026-03-01',50000),status('s2','2026-05-01',100000),status('s3','2026-07-01',200000,'USD')];
  assert.equal(latestLoanStatus(p,'INR').id,'s2');assert.equal(latestLoanStatus(p,'USD').id,'s3');assert.equal(latestLoanStatus(p,'CHF'),null);assert.equal(validatePlanning(p),p);
});
test('planning validation rejects bad dates, unsafe amounts, orphaned subtypes and bad references',()=>{
  const p=defaultPlanning();p.investments=[investment()];
  p.investments[0].endDate='2026-03-14';assert.throws(()=>validatePlanning(p),/investment data/);
  p.investments[0].endDate='2026-02-30';assert.throws(()=>validatePlanning(p),/investment data/);
  p.investments[0].endDate='2026-05-03';p.investments[0].monthly=1.5;assert.throws(()=>validatePlanning(p),/investment data/);
  p.investments=[];p.subtypes[0].parentId='missing';assert.throws(()=>validatePlanning(p),/subtype parent/);
  p.subtypes[0].parentId='bank';p.valuations=[{id:'v',accountTypeId:'investment',subtypeId:'savings',categoryId:'asset',month:'2026-03',value:1,currency:'INR'}];assert.throws(()=>validatePlanning(p),/valuation data/);
});
test('repayment records retain exact amounts and reject percentages outside their domain',()=>{
  const p=defaultPlanning(),r={id:'r',sequence:1,paymentType:'Agreement',agreementValue:123456789,percentage:10.5,toPay:12962963,demand:12000000,paid:10000000,comment:'Demand received',currency:'INR'};p.repayments.push(r);
  assert.equal(validatePlanning(p),p);r.percentage=101;assert.throws(()=>validatePlanning(p),/repayment schedule/);r.percentage=10.5;r.toPay=Number.MAX_SAFE_INTEGER+1;assert.throws(()=>validatePlanning(p),/repayment schedule/);
});
