import {chromium} from 'playwright';
import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';

await fs.mkdir('previews/screens',{recursive:true});
await fs.mkdir('previews/images',{recursive:true});
const css=await fs.readFile('src/styles.css','utf8');
const license=await fs.readFile('node_modules/fflate/LICENSE','utf8');
const compiled=await build({entryPoints:['src/app.js'],bundle:true,format:'iife',target:'chrome110',write:false,minify:true,legalComments:'none'});
await fs.writeFile('previews/interactive-demo.html',`<!doctype html><html lang="en" data-preview="true"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pocket Ledger · Interactive tablet preview</title><style>${css}</style></head><body><!-- Third-party runtime: fflate 0.8.3\n${license}\n--><div id="app"></div><dialog id="modal"></dialog><div id="toast" role="status"></div><script>${compiled.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></body></html>`);

const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-first-run','--disable-background-networking']});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1,locale:'en-GB'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const screens=[];
const labels={dashboard:'Overview',transactions:'Transactions',imports:'Import a statement',categories:'Categories & subcategories',reports:'Charts & pivot tables',budgets:'Budget comparison',timeline:'Money Timeline',settings:'Settings & security'};
async function capture(key,label) {
  await page.locator('#toast').evaluate(t=>t.classList.remove('show'));
  const modalOpen=await page.locator('#modal').evaluate(d=>d.open);
  await page.screenshot({path:`previews/images/${key}.png`,fullPage:!modalOpen});
  const content=await page.evaluate(()=>{
    const clone=document.body.cloneNode(true);
    const live=document.body.querySelectorAll('input,select,textarea'),copy=clone.querySelectorAll('input,select,textarea');
    live.forEach((element,i)=>{
      const target=copy[i];
      if(element.tagName==='SELECT')Array.from(target.options).forEach((o,j)=>{if(element.options[j].selected)o.setAttribute('selected','');else o.removeAttribute('selected');});
      else if(element.tagName==='TEXTAREA')target.textContent=element.value;
      else {target.setAttribute('value',element.type==='password'?'':element.value);if(element.checked)target.setAttribute('checked','');else target.removeAttribute('checked');}
    });
    clone.querySelectorAll('script').forEach(s=>s.remove());
    return clone.innerHTML;
  });
  const navScript=`document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>location.href=b.dataset.view+'.html');document.querySelectorAll('form').forEach(f=>f.onsubmit=e=>e.preventDefault());${modalOpen?"const d=document.querySelector('dialog');d.close();d.showModal();document.querySelectorAll('[data-action=close-modal]').forEach(b=>b.onclick=()=>d.close());":''}`;
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${label} · Pocket Ledger screen</title><style>${css}</style></head><body>${content}<a href="../index.html" style="position:fixed;bottom:12px;right:16px;background:#193e32;color:white;padding:10px 16px;border-radius:8px;text-decoration:none;z-index:999;font:12px 'Segoe UI'">← All screens</a><script>${navScript}</script></body></html>`;
  await fs.writeFile(`previews/screens/${key}.html`,html);screens.push({key,label});
}
await page.goto('http://127.0.0.1:4173/?demo=1');await page.locator('h1').waitFor();
for(const view of Object.keys(labels)) {await page.locator(`.sidebar [data-view="${view}"]`).click();await capture(view,labels[view]);}
await page.locator('.sidebar [data-view="budgets"]').click();await page.locator('[data-action=budget-year]').click();await capture('budget-yearly','Yearly budget & historical comparison');
const forms=[['transactions','add-transaction','transaction-form','Transaction entry & final debit'],['categories','add-category','category-form','Custom category & subcategory form'],['reports','add-report','report-form','Editable chart & pivot builder'],['budgets','add-budget','budget-form','Monthly / annual budget form'],['timeline','add-family','family-form','Family member & age form'],['timeline','add-milestone','milestone-form','Future milestone & return assumptions']];
for(const [view,action,key,label]of forms) {
  await page.locator(`.sidebar [data-view="${view}"]`).click();await page.locator(`[data-action="${action}"]`).first().click();
  if(key==='transaction-form'){await page.locator('#modal [name=description]').fill('Weekly grocery shop');await page.locator('#modal [name=subcategory]').selectOption(JSON.stringify(['food','Groceries']));await page.locator('#modal [name=debit]').fill('2850');await page.locator('#modal [name=final]').fill('2700');}
  if(key==='report-form'){await page.locator('#modal [name=name]').fill('Family spending by month');await page.locator('#modal [name=type]').selectOption('pivot');await page.locator('#modal [name=column]').selectOption('month');await page.locator('#modal [name=categories][value=food]').check();await page.locator('#modal [name=categories][value=family]').check();}
  if(key==='milestone-form'){await page.locator('#modal [name=name]').fill('Aarav’s university');await page.locator('#modal [name=date]').fill('2035-07-01');await page.locator('#modal [name=target]').fill('3500000');await page.locator('#modal [name=saved]').fill('600000');await page.locator('#modal [name=monthly]').fill('18000');await page.locator('#modal [name=rate]').fill('7');await page.locator('#modal [name=inflation]').fill('5');}
  await capture(key,label);await page.locator('#modal [data-action=close-modal]').first().click();
}
await page.locator('.sidebar [data-view=imports]').click();await page.locator('#statement-file').setInputFiles('samples/statement.csv');await page.locator('#map-form').waitFor();await capture('import-mapping','Match bank statement columns');await page.locator('#map-form [type=submit]').click();await page.locator('.review').waitFor();await capture('import-review','Editable statement review');
await page.goto('http://127.0.0.1:4173/');await page.locator('#auth-form').waitFor();await capture('password','Private password-protected vault');

await page.setViewportSize({width:800,height:1280});await page.goto('http://127.0.0.1:4173/?demo=1&view=timeline');await page.locator('h1').waitFor();await capture('tablet-portrait','Tablet portrait · Money Timeline');
for(const width of [390,800,1280]) {await page.setViewportSize({width,height:900});for(const view of Object.keys(labels)){await page.goto(`http://127.0.0.1:4173/?demo=1&view=${view}`);await page.locator('h1').waitFor();const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)throw new Error(`Page overflow at ${width}px in ${view}`);}}
await page.goto('file:///'+path.resolve('previews/interactive-demo.html').replaceAll('\\','/'));await page.locator('h1').waitFor();await page.locator('.sidebar [data-view=reports]').click();await page.getByRole('heading',{name:'Insights that fit your life'}).waitFor();
if(errors.length)throw new Error(errors.join('\n'));
await browser.close();
const cards=screens.map(s=>`<a class="card" href="screens/${s.key}.html"><img src="images/${s.key}.png" alt="${s.label} screen" loading="lazy"><div><span>${s.label}</span><b>Open screen ↗</b></div></a>`).join('');
await fs.writeFile('previews/index.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pocket Ledger · Screens & forms</title><style>body{margin:0;font:15px 'Segoe UI',Arial,sans-serif;background:#f4f5ef;color:#193e32}main{max-width:1400px;margin:auto;padding:55px 5vw}small{color:#82916f;letter-spacing:2px}h1{font-size:44px;font-weight:500;letter-spacing:-1.5px;margin:15px 0}p{color:#79866e;line-height:1.8;max-width:780px}.actions{display:flex;gap:15px;margin:24px 0 35px;flex-wrap:wrap}.button{background:#193e32;color:white;padding:14px 21px;border-radius:9px;text-decoration:none}.button.light{background:white;color:#193e32;border:1px solid #dde4d3}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:22px}.card{background:white;border:1px solid #e0e6d7;border-radius:13px;overflow:hidden;text-decoration:none;color:inherit;box-shadow:0 8px 20px #183d2505}.card img{display:block;width:100%;height:240px;object-fit:cover;object-position:top;border-bottom:1px solid #e7ebdf}.card>div{padding:20px;display:flex;flex-direction:column;gap:9px}.card b{font-size:11px;color:#92a078;font-weight:500}.note{padding:17px 22px;background:#e8eedd;border-radius:10px;margin:30px 0;font-size:13px}</style></head><body><main><small>A PERSONAL LEDGER, THOUGHTFULLY DESIGNED</small><h1>Your money. Your perspective.</h1><p>Explore the tablet app’s screens and forms. These previews use fictional transactions and family details. INR, CHF and USD each have their own view and totals.</p><div class="actions"><a class="button" href="interactive-demo.html">Open interactive preview →</a><a class="button light" href="../README.md">Build & installation guide</a></div><div class="note">${screens.length} HTML screens with PNG screenshots · Designed for an 11-inch tablet in landscape and portrait · Click a card to open its full HTML screen. The interactive preview lets you try the forms with temporary sample data.</div><div class="grid">${cards}</div><p style="margin-top:35px;font-size:12px">Choose a subcategory to assign its main category automatically. Amounts appear as Debit → Final debit → Credit. Android source and installation instructions are included. Scanned PDFs require OCR; selectable-text PDFs are processed locally.</p></main></body></html>`);
console.log(`Saved interactive preview, ${screens.length} HTML screens and ${screens.length} PNG screenshots. Responsive checks passed at 390, 800 and 1280 CSS pixels.`);
