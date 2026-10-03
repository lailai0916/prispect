import { chromium } from 'playwright';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const out=import.meta.dirname;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1050},colorScheme:'light'});
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
await page.goto(process.env.PRISPECT_PROTOTYPE_URL||'http://127.0.0.1:4410/prototype.html');
const checks=[];
async function check(name,condition){if(!condition)throw new Error(name);checks.push({name,pass:true});}
await page.getByRole('button',{name:'生成具体询问',exact:true}).click();
await check('inline-original-statement-generates-specific-request',(await page.locator('section').nth(0).locator('.feedback').textContent()).includes('尚未到账的退款不抵减敞口'));
await page.getByRole('button',{name:'B：就地显示差异',exact:true}).click();
await check('version-difference-retains-independent-assumptions',(await page.locator('section').nth(1).locator('.feedback').textContent()).includes('独立假设分支保持原条件'));
await page.getByRole('button',{name:'B：已知转载族＋正文范围',exact:true}).click();
await check('source-count-does-not-create-rating',(await page.locator('section').nth(2).locator('.feedback').textContent()).includes('条数不改变评级'));
await page.locator('#prediction').check();await page.getByRole('button',{name:'临时撤回利润并验证'}).click();
await check('prediction-compares-dependent-pauses-with-independent-fact',(await page.locator('#trial').textContent()).includes('经营现金仍可查'));
await page.getByRole('button',{name:'恢复',exact:true}).click();
await check('restore-retains-exact-synthetic-ratio',(await page.locator('#trial').textContent()).includes('现金利润比60%'));
await page.screenshot({path:resolve(out,'prototype-desktop.png'),fullPage:true});
await page.setViewportSize({width:375,height:812});await page.emulateMedia({colorScheme:'dark'});
await check('375-dark-no-page-overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.screenshot({path:resolve(out,'prototype-narrow-dark.png'),fullPage:true});
await check('zero-page-errors',errors.length===0);
writeFileSync(resolve(out,'prototype-results.json'),JSON.stringify({mode:'synthetic-design-prototype; no company queries or saved records',capturedAt:new Date().toISOString(),sourceSha256:createHash('sha256').update(readFileSync(resolve(out,'../../design/prototype.html'))).digest('hex'),browser:browser.version(),checks,pageErrors:errors,userEffects:'Not tested with real users'},null,2));
await browser.close();
