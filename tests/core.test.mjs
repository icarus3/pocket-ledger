import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/core.js';
import {createVault,createPinVault,changeCredential,unlock,encrypt} from '../src/vault.js';
import {mapTransactions,autoMap} from '../src/imports.js';

test('money parsing is exact, handles bank notation and rejects ambiguous decimals',()=>{
  assert.equal(C.moneyInput(0.29),29);assert.ok(Number.isNaN(C.moneyInput(1.234)));assert.ok(Number.isNaN(C.moneyInput(0.004)));
  assert.equal(C.moneyInput('1,23,456.78'),12345678);assert.equal(C.moneyInput('(25.01)'),-2501);assert.equal(C.moneyInput('250.00 DR'),-25000);assert.equal(C.moneyInput('250.00 CR'),25000);assert.equal(C.moneyInput('0.29'),29);assert.equal(C.moneyInput('—'),0);assert.ok(Number.isNaN(C.moneyInput('10.001')));assert.ok(Number.isNaN(C.moneyInput('1e3')));
});
test('date normalization validates calendar boundaries and avoids timezone shifts',()=>{
  assert.equal(C.normalizeDate('29/02/2024'),'2024-02-29');assert.equal(C.normalizeDate('29/02/2025'),'');assert.equal(C.normalizeDate('31/04/2026'),'');assert.equal(C.normalizeDate('04/03/2026'),'2026-03-04');assert.equal(C.normalizeDate('04/03/2026','MDY'),'2026-04-03');assert.equal(C.normalizeDate('2026-10-02'),'2026-10-02');assert.equal(C.normalizeDate(25569),'1970-01-01');
});
test('CSV preserves multiline descriptions, quotes and empty debit fields',()=>{
  const rows=C.parseCSV('\uFEFFDate,Description,Debit,Credit\r\n01/10/2026,"Shop, \\"hello\\"",,24\r\n'.replaceAll('\\"','""'));
  assert.equal(rows[1][1],'Shop, "hello"');assert.equal(rows[1][2],'');
  assert.deepEqual(C.parseCSV('a;b\n"line 1\nline 2";3'),[['a','b'],['line 1\nline 2','3']]);
  assert.throws(()=>C.parseCSV('a,b\n"unclosed,1'));
});
test('statement mapping preserves refunds and signed amount conventions',()=>{
  const mapping=autoMap(['Date','Description','Amount']);
  const t=mapTransactions([['02/10/2026','Purchase','-25.50'],['03/10/2026','Refund','10']],mapping);
  assert.equal(t[0].debit,2550);assert.equal(t[0].credit,0);assert.equal(t[1].credit,1000);assert.equal(t[0].date,'2026-10-02');
  const x=mapTransactions([['02/10/2026','Purchase','25.50']],mapping,{signedMode:'positive-debit'});assert.equal(x[0].debit,2550);
});
test('pivots, budgets and duplicate checks keep currencies separate and include adjustments',()=>{
  const d=C.newData();d.transactions=[{id:'a',date:'2026-10-01',description:'A',categoryId:'food',debit:10000,credit:0,adjustment:-2000,currency:'INR'},{id:'b',date:'2026-10-02',description:'Refund',categoryId:'food',debit:0,credit:1000,adjustment:0,currency:'INR'},{id:'c',date:'2026-10-01',description:'A',categoryId:'food',debit:50000,credit:0,adjustment:0,currency:'CHF'}];
  assert.equal(C.actual(d,'food','2026-10'),7000);
  const p=C.pivot(d,{dimension:'category',column:'month',measure:'final',currency:'INR'});assert.equal(p.get('Food & groceries','2026-10'),7000);
  const chf=C.pivot(d,{dimension:'category',measure:'final',currency:'CHF'});assert.equal(chf.get('Food & groceries','Total'),50000);
  assert.notEqual(C.fingerprint({...d.transactions[0],currency:'CHF'}),C.fingerprint(d.transactions[0]));
});
test('annual budget aggregation and overlaps do not double count',()=>{
  const d=C.newData();d.budgets=[{id:'b',categoryId:'food',period:'2026-01',amount:50000,currency:'INR'},{id:'c',categoryId:'food',period:'2026-02',amount:70000,currency:'INR'},{id:'d',categoryId:'food',period:'2026',amount:90000,currency:'CHF'}];
  assert.equal(C.planned(d,'food','2026'),120000);assert.equal(C.planned(d,'food','2026-01'),50000);
  assert.equal(C.budgetConflict(d,{categoryId:'food',period:'2026',currency:'INR'}),true);assert.equal(C.budgetConflict(d,{categoryId:'food',period:'2026-03',currency:'INR'}),false);
});
test('milestone projection handles zero growth, birthdays, inflation and past dates',()=>{
  assert.equal(C.ageOn('1990-10-20','2030-10-19'),39);assert.equal(C.ageOn('1990-10-20','2030-10-20'),40);
  const m={date:'2027-01-01',saved:100000,monthly:10000,target:200000,rate:0,inflation:0};
  assert.deepEqual(C.projection(m,'2026-01-01'),{months:12,projected:220000,required:200000,gap:0});
  assert.equal(C.projection({...m,inflation:5},'2026-01-01').required,210000);
  assert.equal(C.projection({...m,date:'2025-01-01'},'2026-01-01').months,0);
});
test('CSV exports date dimensions, currency, three amount columns and neutralizes formulas',()=>{
  const d=C.newData();d.transactions=[{date:'2026-01-02',description:'=HYPERLINK("bad")',categoryId:'food',debit:100,credit:50,adjustment:10,currency:'USD'}];
  const csv=C.exportTransactions(d);assert.match(csv,/"Month","Year"/);assert.match(csv,/"Currency","Review status","Raw values","Debit"/);assert.match(csv,/"'=/);assert.match(csv,/"0.6"/);
  assert.deepEqual(C.parseCSV(csv)[0].slice(-3),['Debit','Final debit','Credit']);
});
test('subcategory selection determines its parent and disambiguates repeated names',()=>{
  const d=C.newData();d.categories.push({id:'extra',name:'Other spending',typeId:'expense',subs:['Groceries','Other']});
  assert.deepEqual(C.resolveClassification(d.categories,C.classificationValue('food','Groceries')),{categoryId:'food',subcategory:'Groceries'});
  assert.deepEqual(C.resolveClassification(d.categories,C.classificationValue('extra','Groceries')),{categoryId:'extra',subcategory:'Groceries'});
  assert.equal(C.resolveClassification(d.categories,C.classificationValue('home','Groceries')),null);
  assert.equal(C.resolveClassification(d.categories,'not JSON'),null);
  assert.equal(C.matchSubcategory(d.categories,'Groceries'),null);
  assert.deepEqual(C.matchSubcategory(d.categories,' groceries ','Food & groceries'),{categoryId:'food',subcategory:'Groceries'});
  assert.deepEqual(C.matchSubcategory(d.categories,'rent','Food & groceries'),{categoryId:'home',subcategory:'Rent'});
});
test('imports infer parents, preserve unknown or ambiguous subcategories for review and use explicit defaults only for missing values',()=>{
  const d=C.newData(),mapping=autoMap(['Date','Description','Debit','Subcategory','Main category']);
  d.categories.push({id:'extra',name:'Other spending',typeId:'expense',subs:['Groceries']});
  const rows=[['01/10/2026','Unique',100,'Rent','Food & groceries'],['01/10/2026','Ambiguous',100,'Groceries',''],['01/10/2026','Qualified',100,'groceries','Other spending'],['01/10/2026','Unknown',100,'Missing sub',''],['01/10/2026','Blank',100,'','']];
  const mapped=mapTransactions(rows,mapping,{categories:d.categories});
  assert.equal(mapped[0].categoryId,'home');assert.equal(mapped[1].categoryId,'');assert.equal(mapped[2].categoryId,'extra');assert.equal(mapped[2].subcategory,'Groceries');
  assert.equal(mapped[3].subcategory,'Missing sub');assert.equal(mapped[3].categoryId,'');assert.equal(mapped[4].categoryId,'');
  assert.ok(C.transactionError(mapped[1],d));assert.equal(C.transactionError(mapped[4],d),'');
  const withDefault=mapTransactions(rows,mapping,{categories:d.categories,defaultSubcategory:C.classificationValue('food','Dining out')});
  assert.equal(withDefault[1].categoryId,'');assert.equal(withDefault[3].categoryId,'');assert.equal(withDefault[4].categoryId,'food');assert.equal(withDefault[4].subcategory,'Dining out');
});
test('categories are optional, legacy backups remain readable and invalid final amounts fail validation',()=>{
  const d=C.newData(),t={id:'t',date:'2026-10-01',description:'Shop',categoryId:'food',subcategory:'Groceries',debit:10000,credit:2000,adjustment:-500,currency:'CHF'};
  assert.equal(C.transactionError(t,d),'');assert.equal(C.transactionError({...t,subcategory:''},d),'');assert.equal(C.transactionError({...t,categoryId:'',subcategory:''},d),'');assert.ok(C.transactionError({...t,categoryId:'home'},d));
  assert.ok(C.transactionError({...t,adjustment:NaN},d));assert.ok(Number.isNaN(C.finalDebit({...t,adjustment:NaN})));
  d.transactions=[{...t,subcategory:''}];assert.equal(C.validateData(d),d);
});
test('adjusted exports reimport with the same debit, final debit and credit including zero and negative final values',()=>{
  const d=C.newData();d.transactions=[7500,0,-500].map((final,i)=>({id:String(i),date:'2026-10-01',description:'Shop '+i,categoryId:'food',subcategory:'Groceries',debit:10000,credit:2000,adjustment:final-8000,currency:'CHF'}));
  const [header,...rows]=C.parseCSV(C.exportTransactions(d));
  const imported=mapTransactions(rows,autoMap(header),{categories:d.categories});
  assert.deepEqual(imported.map(C.finalDebit),[7500,0,-500]);assert.deepEqual(imported.map(t=>t.adjustment),d.transactions.map(t=>t.adjustment));
  assert.ok(imported.every(t=>t.debit===10000&&t.credit===2000&&t.categoryId==='food'&&t.subcategory==='Groceries'));
});
test('encrypted vault round trips, randomizes ciphertext, and rejects wrong password/tampering',async()=>{
  const data=C.newData();data.family.push({id:'f',name:'SensitiveName',birthDate:'1990-01-01'});
  const vault=await createVault(data,'correct horse battery');
  assert.ok(!JSON.stringify(vault.envelope).includes('SensitiveName'));
  assert.deepEqual((await unlock(vault.envelope,'correct horse battery')).data,data);
  const second=await encrypt(data,vault.key,vault.salt);assert.notEqual(second.iv,vault.envelope.iv);assert.notEqual(second.ciphertext,vault.envelope.ciphertext);
  await assert.rejects(unlock(vault.envelope,'incorrect password'));
  await assert.rejects(unlock({...vault.envelope,ciphertext:(vault.envelope.ciphertext[0]==='A'?'B':'A')+vault.envelope.ciphertext.slice(1)},'correct horse battery'));
  await assert.rejects(unlock({...vault.envelope,iterations:9e9},'correct horse battery'));
});

test('unresolved imports preserve raw values through encryption, remain null and are excluded from calculations',async()=>{
  const data=C.newData(),rows=C.parseCSV('Date,Description,Debit,Credit,Final debit\n01/10/2026,"  Original description  ",1.234,0,???\n02/10/2026,Valid,10,0,10');
  const tx=mapTransactions(rows.slice(1),autoMap(rows[0]),{categories:data.categories}).map(t=>({...t,currency:'INR',categoryId:'food',needsReview:!!C.transactionError(t,data)}));
  assert.equal(tx[0].debit,null);assert.equal(tx[0].adjustment,null);assert.equal(tx[0].description,'  Original description  ');assert.equal(tx[0].rawValues.debit,'1.234');assert.ok(Number.isNaN(C.finalDebit(tx[0])));
  data.transactions=tx;assert.equal(C.actual(data,'food','2026-10'),1000);assert.equal(C.reportRows(data,{currency:'INR'}).length,1);
  const vault=await createVault(data,'legacy recovery password');const restored=(await unlock(vault.envelope,'legacy recovery password')).data;
  assert.equal(restored.transactions[0].debit,null);assert.equal(restored.transactions[0].rawValues.final,'???');assert.match(C.exportTransactions(restored),/1.234/);
});
test('PIN setup, rotation and recovery preserve legacy data and encrypted drafts',async()=>{
  const data=C.newData();data.workspace={view:'imports',importReview:[{rawValues:{amount:'unresolved-secret'}}],modal:{kind:'transaction',values:[{name:'description',value:'private draft'}]}};
  const legacy=await createVault(data,'legacy recovery password'),original=(await unlock(legacy.envelope,'legacy recovery password')).data;
  const migrated=await createPinVault(original,'0042','legacy recovery password');assert.equal(migrated.envelope.version,2);
  assert.deepEqual((await unlock(migrated.envelope,'0042')).data,data);assert.deepEqual((await unlock(migrated.envelope,'legacy recovery password','recovery')).data,data);
  assert.ok(!JSON.stringify(migrated.envelope).includes('private draft'));await assert.rejects(unlock(migrated.envelope,'0043'));
  const changed=await changeCredential(migrated.envelope,data,'0042','5678');await assert.rejects(unlock(changed.envelope,'0042'));assert.deepEqual((await unlock(changed.envelope,'5678')).data,data);
  const recovered=await changeCredential(changed.envelope,data,'legacy recovery password','0007','pin',true);assert.deepEqual((await unlock(recovered.envelope,'0007')).data,data);
  const password=await changeCredential(recovered.envelope,data,'legacy recovery password','new recovery password','recovery');await assert.rejects(unlock(password.envelope,'legacy recovery password','recovery'));assert.deepEqual((await unlock(password.envelope,'0007')).data,data);
  await assert.rejects(createPinVault(data,'123','safe recovery password'));await assert.rejects(createPinVault(data,'12345','safe recovery password'));
  await assert.rejects(changeCredential(password.envelope,data,'wrong recovery','1234','pin',true));assert.deepEqual((await unlock(password.envelope,'new recovery password','recovery')).data,data);
});
