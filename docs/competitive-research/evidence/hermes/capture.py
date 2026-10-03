from playwright.sync_api import sync_playwright
from pathlib import Path
import json,time
OUT=Path(__file__).parent
BASE='http://127.0.0.1:4402'
records=[]
with sync_playwright() as driver:
 browser=driver.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 def capture(label,kind='fixture',full=False):
  page.wait_for_timeout(1100)
  page.screenshot(path=str(OUT/(label+'.png')),full_page=full)
  (OUT/(label+'.txt')).write_text(page.locator('body').inner_text())
  records.append({'label':label,'url':page.url,'kind':kind,'atUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'viewport':page.viewport_size,'scrollY':page.evaluate('scrollY')})
 def go(path):
  r=page.goto(BASE+path,wait_until='domcontentloaded',timeout=45000)
  records.append({'path':path,'status':r.status})
 go('/'); capture('01-home','runtime')
 page.get_by_role('button',name='筛选',exact=True).click();capture('02-filter-empty','runtime')
 go('/report/mock-healthy');capture('03-healthy-lite')
 go('/report/mock-danger');capture('04-danger-lite')
 page.get_by_role('button',name='查看证据',exact=True).first.click();capture('05-danger-evidence-drawer')
 page.get_by_role('button',name='关闭',exact=True).click()
 page.get_by_role('button',name='PRO',exact=True).click();capture('06-danger-pro-top')
 page.locator('#financial').scroll_into_view_if_needed();capture('07-danger-pro-financial')
 page.locator('#network').scroll_into_view_if_needed();capture('08-danger-pro-network')
 page.locator('#evidence').scroll_into_view_if_needed();capture('09-danger-pro-evidence')
 page.get_by_role('button',name='LITE',exact=True).click()
 page.set_viewport_size({'width':390,'height':844});page.evaluate('scrollTo(0,0)');capture('10-danger-lite-mobile')
 page.get_by_role('button',name='PRO',exact=True).click();page.locator('#financial').scroll_into_view_if_needed();capture('11-danger-pro-mobile-financial')
 page.set_viewport_size({'width':1440,'height':1000})
 go('/compare');capture('12-compare-empty','runtime')
 go('/chat');capture('13-chat-unconfigured','runtime')
 go('/');page.get_by_role('button',name='搜索',exact=True).click()
 page.get_by_placeholder('输入公司名称或股票代码…').fill('600519')
 page.wait_for_timeout(14000);capture('14-search-real-or-unavailable','live-query')
 page.evaluate("localStorage.setItem('hermes-mode',JSON.stringify({state:{mode:'pro'},version:0}))")
 try:
  go('/report/600519');page.wait_for_timeout(3000);capture('15-listed-real-or-error','live-query')
 except Exception as e:
  records.append({'path':'/report/600519','error':str(e)})
  page.screenshot(path=str(OUT/'15-listed-blocked.png'))
  (OUT/'15-listed-blocked.txt').write_text(page.locator('body').inner_text())
 records.append({'pageErrors':errors})
 (OUT/'browser-log.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
 browser.close()
