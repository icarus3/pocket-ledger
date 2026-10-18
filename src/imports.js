import {unzipSync,strFromU8} from 'fflate';
import {parseCSV,normalizeDate,moneyInput,uid,matchSubcategory,resolveClassification} from './core.js';
const xml=text=>{const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw new Error('The spreadsheet contains invalid XML.');return doc;};
export function readXLSX(bytes) {
  let total=0;
  const files=unzipSync(bytes,{filter:entry=>{total+=entry.originalSize;if(total>60*1024*1024)throw new Error('This expanded workbook exceeds 60 MB. Please import a smaller workbook.');return /\.xml$|\.rels$/.test(entry.name);}});
  const read=name=>files[name]?xml(strFromU8(files[name])):null;
  const workbook=read('xl/workbook.xml'), rels=read('xl/_rels/workbook.xml.rels');
  if(!workbook||!rels)throw new Error('This file is not a supported .xlsx workbook.');
  const shared=[...(read('xl/sharedStrings.xml')?.querySelectorAll('si')||[])].map(si=>[...si.querySelectorAll('t')].map(t=>t.textContent).join(''));
  const date1904=['1','true'].includes(workbook.querySelector('workbookPr')?.getAttribute('date1904'));
  return [...workbook.querySelectorAll('sheet')].map(sheet=>{
    const id=sheet.getAttribute('r:id');
    const target=[...rels.querySelectorAll('Relationship')].find(r=>r.getAttribute('Id')===id)?.getAttribute('Target');
    const path=target?.startsWith('/')?target.slice(1):'xl/'+target;
    const doc=read(path.replace(/^xl\/\.\//,'xl/'));
    const rows=[...(doc?.querySelectorAll('sheetData > row')||[])].map(row=>{
      const cells=[];
      for(const c of row.querySelectorAll('c')) {
        const letters=(c.getAttribute('r')||'A1').match(/[A-Z]+/)[0];let index=0;for(const ch of letters)index=index*26+ch.charCodeAt(0)-64;
        if(index>1000)throw new Error('This sheet has too many columns. Export just the statement table.');
        const t=c.getAttribute('t'), value=c.querySelector('v')?.textContent || '';
        cells[index-1]=t==='s'?shared[+value]||'':t==='inlineStr'?[...c.querySelectorAll('t')].map(n=>n.textContent).join(''):t==='b'?(value==='1'?'TRUE':'FALSE'):t==='str'||t==='d'?value:value!==''?Number(value):'';
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
  if(file.size>20*1024*1024)throw new Error('Please choose a statement smaller than 20 MB.');
  const ext=file.name.split('.').pop().toLowerCase();
  if(ext==='xlsx')return {sheets:readXLSX(new Uint8Array(await file.arrayBuffer())),kind:'xlsx'};
  if(ext==='pdf'){const raw=await readPDF(new Uint8Array(await file.arrayBuffer()),password);return {sheets:[{name:'PDF text',rows:parseCSV(raw,'\t')}],kind:'pdf',raw};}
  if(['csv','tsv','txt'].includes(ext))return {sheets:[{name:'Statement',rows:parseCSV(await file.text(),ext==='tsv'?'\t':undefined)}],kind:'csv'};
  throw new Error('Choose CSV, XLSX or a text-based PDF. Save older .xls files as .xlsx first.');
}
const aliases={date:['date','transaction date','txn date','value date','posting date'],description:['description','narration','particulars','details','transaction details','memo'],debit:['debit','withdrawal','withdrawals','debit amount','withdrawal amount'],final:['final debit','final debit amount'],credit:['credit','deposit','deposits','credit amount','deposit amount'],amount:['amount','transaction amount'],category:['category','main category'],subcategory:['subcategory','sub category','sub-category'],account:['account','account name']};
export function autoMap(header) {const map={};for(const [key,names]of Object.entries(aliases))map[key]=header.findIndex(h=>names.includes(String(h).trim().toLowerCase()));return map;}
export function mapTransactions(rows,mapping,{dateFormat='DMY',account='',defaultSubcategory='',categories=[],signedMode='negative-debit',date1904=false}={}) {
  const get=(r,key)=>mapping[key]>=0?r[mapping[key]]??'':'';
  return rows.map(row=>{
    let debit=moneyInput(get(row,'debit')),credit=moneyInput(get(row,'credit'));
    if(mapping.amount>=0 && mapping.debit<0 && mapping.credit<0) {
      const amount=moneyInput(get(row,'amount'));
      const isDebit=signedMode==='negative-debit'?amount<0:amount>0;
      debit=isDebit?Math.abs(amount):0;credit=isDebit?0:Math.abs(amount);
      if(!Number.isFinite(amount))debit=NaN;
    }
    const subcategory=String(get(row,'subcategory')).trim();
    const classification=subcategory ? matchSubcategory(categories,subcategory,get(row,'category')) : resolveClassification(categories,defaultSubcategory);
    const adjustment=mapping.final>=0 && String(get(row,'final')).trim()!=='' ? moneyInput(get(row,'final'))-debit+credit : 0;
    let dateValue=get(row,'date');if(date1904 && typeof dateValue==='number')dateValue+=1462;
    return {id:uid(),date:normalizeDate(dateValue,dateFormat),description:String(get(row,'description')),debit,credit,adjustment,categoryId:classification?.categoryId||'',subcategory:classification?.subcategory||subcategory,account:String(get(row,'account')||account),sourceRow:row,include:true};
  });
}
