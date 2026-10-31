import {unzipSync,strFromU8} from 'fflate';
import {parseCSV,normalizeDate,moneyInput,uid,resolveClassification} from './core.js';
export const MAX_STATEMENT_ROWS=500000;
export const CSV_FILE_LIMIT=128*1024*1024;
const xml=text=>{const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw new Error('The spreadsheet contains invalid XML.');return doc;};
const elements=(node,name)=>node ? [...node.getElementsByTagNameNS('*',name)] : [];
const first=(node,name)=>elements(node,name)[0];
const workbookPath=target=>{
  const parts=[];
  for(const part of (target.startsWith('/')?target.slice(1):'xl/'+target).replaceAll('\\','/').split('/')) {
    if(part==='..')parts.pop();else if(part&&part!=='.')parts.push(part);
  }
  return parts.join('/');
};
export function readXLSX(bytes) {
  let total=0;
  const files=unzipSync(bytes,{filter:entry=>{total+=entry.originalSize;if(total>60*1024*1024)throw new Error('This expanded workbook exceeds 60 MB. Please import a smaller workbook.');return /\.xml$|\.rels$/.test(entry.name);}});
  const read=name=>files[name]?xml(strFromU8(files[name])):null;
  const workbook=read('xl/workbook.xml'), rels=read('xl/_rels/workbook.xml.rels');
  if(!workbook||!rels)throw new Error('This file is not a supported .xlsx workbook.');
  const shared=elements(read('xl/sharedStrings.xml'),'si').map(si=>elements(si,'t').map(t=>t.textContent).join(''));
  const date1904=['1','true'].includes(first(workbook,'workbookPr')?.getAttribute('date1904'));
  return elements(workbook,'sheet').map(sheet=>{
    const id=[...sheet.attributes].find(a=>a.localName==='id')?.value;
    const relationship=elements(rels,'Relationship').find(r=>r.getAttribute('Id')===id);
    const target=relationship?.getAttribute('Target');
    if(!target||relationship.getAttribute('TargetMode')==='External')throw new Error('This workbook has an unsupported worksheet link. Save a local .xlsx copy.');
    const doc=read(workbookPath(target));
    if(!doc)throw new Error('The workbook is missing worksheet '+sheet.getAttribute('name')+'.');
    const rows=elements(first(doc,'sheetData'),'row').map(row=>{
      const cells=[];
      for(const c of elements(row,'c')) {
        const letters=(c.getAttribute('r')||'').toUpperCase().match(/[A-Z]+/)?.[0];let index=letters?0:cells.length+1;for(const ch of letters||'')index=index*26+ch.charCodeAt(0)-64;
        if(index>1000)throw new Error('This sheet has too many columns. Export just the statement table.');
        const t=c.getAttribute('t'), value=first(c,'v')?.textContent || '';
        cells[index-1]=t==='s'?shared[+value]||'':t==='inlineStr'?elements(c,'t').map(n=>n.textContent).join(''):t==='b'?(value==='1'?'TRUE':'FALSE'):t==='str'||t==='d'||t==='e'?value:value!==''?Number(value):first(c,'f')?'='+first(c,'f').textContent:'';
      }
      return Array.from({length:cells.length},(_,i)=>cells[i]??'');
    }).filter(row=>row.some(v=>v!==''));
    return {name:sheet.getAttribute('name'),rows,date1904};
  });
}
export async function readPDF(bytes,password='') {
  // Keep the pinned PDFium engine as local ES modules, with its local WASM file.
  const modulePath='./vendor/pdf/browser.js';
  const {createEngine}=await import(/* @vite-ignore */ modulePath);
  const engine=await createEngine();let doc;
  try {
    doc=await engine.open(bytes,{password});
    if(doc.pageCount>150)throw new Error('Please split this PDF into statements of 150 pages or fewer.');
    const m=engine.module, output=[];let columnStarts=null;
    for(let p=0;p<doc.pageCount;p++) {
      const page=m._FPDF_LoadPage(doc.documentHandle,p), tp=m._FPDFText_LoadPage(page), ptr=engine.malloc(32);
      try {
        const lines=[]; const count=m._FPDFText_CountChars(tp);
        if(count>150000)throw new Error('This PDF page is too large. Please use a smaller statement.');
        for(let i=0;i<count;i++) {
          const code=m._FPDFText_GetUnicode(tp,i);if(code<32)continue;
          if(!m._FPDFText_GetCharBox(tp,i,ptr,ptr+8,ptr+16,ptr+24))continue;
          let [left,right]=Array.from(m.HEAPF64.subarray(ptr/8,ptr/8+4));
          if(!m._FPDFText_GetCharOrigin(tp,i,ptr+16,ptr+24))continue;
          const originX=m.HEAPF64[(ptr+16)/8],y=m.HEAPF64[(ptr+24)/8];
          if(code===32){left=originX;right=originX+2;}
          let line=lines.find(l=>Math.abs(l.y-y)<2);
          if(!line){line={y,chars:[]};lines.push(line);}
          line.chars.push({left,right,char:String.fromCodePoint(code)});
        }
        lines.sort((a,b)=>b.y-a.y);
        for(const line of lines) {
          line.chars.sort((a,b)=>a.left-b.left);let text='',right=0;const blocks=[];let block=null;
          for(const c of line.chars){
            if(!block || c.left-right>10){block={left:c.left,text:''};blocks.push(block);}
            if(text && c.left-right>10)text+='\t';else if(text && c.left-right>2.5 && !text.endsWith(' '))text+=' ';
            block.text+=c.char;text+=c.char;right=c.right;
          }
          if(blocks.some(b=>/^(?:transaction\s*)?date$/i.test(b.text.trim())) && blocks.some(b=>/debit|credit|withdrawal|deposit|amount/i.test(b.text)))columnStarts=blocks.map(b=>b.left-10);
          if(columnStarts && blocks.length>1) {
            const cells=columnStarts.map(()=>[]);
            for(const b of blocks){let index=0;for(let c=0;c<columnStarts.length;c++)if(b.left>=columnStarts[c])index=c;cells[index].push(b.text.trim());}
            text=cells.map(c=>c.join(' ')).join('\t');
          }
          if(text.trim())output.push(text.trim());
        }
      } finally {m.wasmExports.free(ptr);m._FPDFText_ClosePage(tp);m._FPDF_ClosePage(page);}
    }
    if(!output.length)throw new Error('No selectable text was found. Scanned/image PDFs need OCR first; export a CSV or Excel statement from your bank.');
    return output.join('\n');
  } finally {doc?.destroy();await engine.destroy();}
}
export async function readFile(file,password='') {
  const ext=file.name.split('.').pop().toLowerCase();
  const largeText=['csv','tsv','txt'].includes(ext),limit=largeText?CSV_FILE_LIMIT:20*1024*1024;
  if(file.size>limit)throw new Error(`Please choose a ${largeText?'CSV/TSV smaller than 128':'workbook or PDF smaller than 20'} MB.`);
  if(ext==='xlsx')return {sheets:readXLSX(new Uint8Array(await file.arrayBuffer())),kind:'xlsx'};
  if(ext==='pdf'){const raw=await readPDF(new Uint8Array(await file.arrayBuffer()),password);return {sheets:[{name:'PDF text',rows:parseCSV(raw,'\t')}],kind:'pdf',raw};}
  if(['csv','tsv','txt'].includes(ext))return {sheets:[{name:'Statement',rows:parseCSV(await file.text(),ext==='tsv'?'\t':undefined)}],kind:'csv'};
  throw new Error('Choose CSV, XLSX or a text-based PDF. Save older .xls files as .xlsx first.');
}
const aliases={date:['date','transaction date','txn date','value date','posting date'],description:['description','narration','particulars','details','transaction details','memo'],debit:['debit','withdrawal','withdrawals','debit amount','withdrawal amount'],final:['final debit','final debit amount'],credit:['credit','deposit','deposits','credit amount','deposit amount'],amount:['amount','transaction amount'],category:['category','main category'],subcategory:['subcategory','sub category','sub-category'],account:['account','account name']};
export function autoMap(header) {const map={};for(const [key,names]of Object.entries(aliases))map[key]=header.findIndex(h=>names.includes(String(h).trim().toLowerCase()));return map;}
export function mapTransactions(rows,mapping,{dateFormat='DMY',account='',defaultSubcategory='',categories=[],signedMode='negative-debit',date1904=false}={}) {
  const get=(r,key)=>mapping[key]>=0?r[mapping[key]]??'':'';
  // Unmapped aliases have no input value to preserve. Keeping only mapped
  // fields saves dozens of megabytes in a large encrypted JSON payload; the
  // complete original row is retained separately in sourceRow.
  const normalize=value=>String(value??'').trim().toLowerCase(),parents=new Map(),children=new Map(),defaultClassification=resolveClassification(categories,defaultSubcategory),rawKeys=Object.keys(aliases).filter(key=>mapping[key]>=0),dates=new Map();
  for(const c of categories){const name=normalize(c.name);if(!parents.has(name))parents.set(name,c);for(const subcategory of c.subs){const key=normalize(subcategory),matches=children.get(key)||[];matches.push({categoryId:c.id,subcategory});children.set(key,matches);}}
  return rows.map(row=>{
    let debit=moneyInput(get(row,'debit')),credit=moneyInput(get(row,'credit'));
    if(mapping.amount>=0 && mapping.debit<0 && mapping.credit<0) {
      const amount=moneyInput(get(row,'amount'));
      const isDebit=signedMode==='negative-debit'?amount<0:amount>0;
      debit=isDebit?Math.abs(amount):0;credit=isDebit?0:Math.abs(amount);
      if(!Number.isFinite(amount))debit=NaN;
    }
    const subcategory=String(get(row,'subcategory')).trim();
    const parent=parents.get(normalize(get(row,'category'))),matches=children.get(normalize(subcategory))||[];
    const qualified=matches.length===1?matches:matches.filter(m=>m.categoryId===parent?.id);
    const classification=subcategory ? qualified.length===1?qualified[0]:null : defaultClassification|| (parent?{categoryId:parent.id,subcategory:''}:null);
    const adjustment=mapping.final>=0 && String(get(row,'final')).trim()!=='' ? moneyInput(get(row,'final'))-debit+credit : 0;
    let dateValue=get(row,'date');if(date1904 && typeof dateValue==='number')dateValue+=1462;
    const rawValues={};for(const key of rawKeys)rawValues[key]=get(row,key);
    if(!dates.has(dateValue)){if(dates.size>=4096)dates.clear();dates.set(dateValue,normalizeDate(dateValue,dateFormat));}
    const safe=n=>Number.isSafeInteger(n)&&Math.abs(n)<1e14?n:null;
    return {id:uid(),date:dates.get(dateValue),description:String(get(row,'description')),debit:safe(debit),credit:safe(credit),adjustment:safe(adjustment),categoryId:classification?.categoryId||'',subcategory:classification?.subcategory||subcategory,account:String(get(row,'account')||account),rawValues,sourceRow:row,include:true};
  });
}
