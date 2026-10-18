import fs from 'node:fs/promises';
import {zipSync,strToU8} from 'fflate';
await fs.mkdir('test-results/fixtures',{recursive:true});
const xml=s=>strToU8(s);
const workbook=zipSync({
  '[Content_Types].xml':xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
  'xl/workbook.xml':xml('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Checking" sheetId="1" r:id="rId1"/></sheets></workbook>'),
  'xl/_rels/workbook.xml.rels':xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
  'xl/worksheets/sheet1.xml':xml('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+[
    ['Date','Description','Debit','Credit'],['08/10/2026','Excel groceries',1500,0],['09/10/2026','Excel refund',0,150]
  ].map((row,r)=>`<row r="${r+1}">${row.map((v,c)=>`<c r="${String.fromCharCode(65+c)}${r+1}"${typeof v==='string'?' t="inlineStr"':''}>${typeof v==='string'?`<is><t>${v}</t></is>`:`<v>${v}</v>`}</c>`).join('')}</row>`).join('')+'</sheetData></worksheet>')
});
await fs.writeFile('test-results/fixtures/statement.xlsx',workbook);
const text=(x,y,s)=>`BT /F1 11 Tf ${x} ${y} Td (${s}) Tj ET\n`;
let content='';
for(const [y,values]of [[750,['Date','Description','Debit','Credit']],[720,['10/10/2026','PDF groceries','450.00','']],[690,['11/10/2026','PDF refund','','50.00']]])for(let i=0;i<values.length;i++)if(values[i])content+=text([35,130,380,460][i],y,values[i]);
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`];
let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
await fs.writeFile('test-results/fixtures/statement.pdf',pdf);
console.log('Generated XLSX and selectable-text PDF fixtures.');
