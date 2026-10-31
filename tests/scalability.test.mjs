import {test} from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import * as C from '../src/core.js';
import {mapTransactions,autoMap,readFile,MAX_STATEMENT_ROWS,CSV_FILE_LIMIT} from '../src/imports.js';
import {createVault,unlock} from '../src/vault.js';

test('CSV supports the larger statement size while workbook/PDF limits remain bounded',async()=>{
  assert.equal(MAX_STATEMENT_ROWS,500000);assert.equal(CSV_FILE_LIMIT,128*1024*1024);
  const header='Date,Description,Debit,Credit\n',body='01/10/2026,Repeated transaction,10,0\n';
  const file={name:'statement.csv',size:21*1024*1024,text:async()=>header+body+body};
  const parsed=await readFile(file),mapped=mapTransactions(parsed.sheets[0].rows.slice(1),autoMap(parsed.sheets[0].rows[0]));
  assert.equal(mapped.length,2);assert.ok(mapped.every(t=>t.include));assert.notEqual(mapped[0].id,mapped[1].id);
  await assert.rejects(readFile({...file,size:CSV_FILE_LIMIT+1}),/128 MB/);
  await assert.rejects(readFile({...file,name:'statement.xlsx'}),/20 MB/);
});

// A deliberate capacity check, separate from the fast calculation suite. Run
// node --expose-gc --test tests/scalability.test.mjs to release intermediate CSVs.
test('500,000 imported rows retain raw values through totals, export and encrypted reopen',async t=>{
  const started=performance.now(),timings={},memoryMB={};let checkpoint=started;
  const mark=name=>{timings[name]=Math.round(performance.now()-checkpoint);memoryMB[name]=Math.round(process.memoryUsage().rss/1024/1024);checkpoint=performance.now();};
  const count=500000,data=C.newData(),header='Date,Description,Debit,Credit,Subcategory\n';
  let text=header+'01/10/2026,Repeated statement row,10,0,Groceries\n'.repeat(count);
  let rows=C.parseCSV(text);text=null;mark('parseMs');
  const mapping=autoMap(rows[0]);
  data.transactions=mapTransactions(rows.slice(1),mapping,{categories:data.categories});rows=null;
  for(let i=0;i<count;i++){const row=data.transactions[i];row.currency=i%3===0?'CHF':'INR';if(i%100000===0){row.debit=null;row.rawValues.debit='unresolved';row.needsReview=true;}}
  global.gc?.();mark('mapMs');
  assert.equal(data.transactions.length,count);assert.ok(data.transactions.every(row=>row.include));
  assert.equal(data.transactions[count-1].categoryId,'food');
  C.validateData(data);
  const validINR=data.transactions.reduce((sum,row)=>sum+(row.currency==='INR'&&!row.needsReview?1:0),0);
  assert.equal(C.actual(data,'food','2026-10'),validINR*1000);
  assert.equal(C.pivot(data,{dimension:'category',column:'month',measure:'final',currency:'INR'}).get('Food & groceries','2026-10'),validINR*1000);
  assert.equal(C.pivot(data,{dimension:'category',measure:'count',currency:'CHF'}).get('Food & groceries','Total'),count-validINR-5);
  mark('validateAndAggregateMs');
  let csv=C.exportTransactions(data);
  assert.ok(csv.startsWith('\uFEFF"Date","Month","Year"'));
  assert.ok(csv.includes('unresolved'));assert.ok(csv.includes('"Needs review"'));
  assert.equal((csv.match(/\r\n/g)||[]).length,count);csv=null;global.gc?.();mark('exportMs');
  const vault=await createVault(data,'synthetic capacity recovery');mark('encryptMs');
  assert.equal(vault.envelope.version,1);assert.ok(vault.envelope.ciphertext.length>1000000);
  const restored=(await unlock(vault.envelope,'synthetic capacity recovery')).data;mark('decryptAndValidateMs');
  assert.equal(restored.transactions.length,count);
  assert.equal(restored.transactions[0].debit,null);assert.equal(restored.transactions[0].rawValues.debit,'unresolved');
  assert.equal(restored.transactions[count-1].sourceRow[1],'Repeated statement row');
  assert.equal(restored.transactions[count-1].rawValues.debit,'10');
  assert.equal(C.actual(restored,'food','2026-10'),validINR*1000);
  t.diagnostic(JSON.stringify({rows:count,...timings,totalMs:Math.round(performance.now()-started),memoryMB}));
});
