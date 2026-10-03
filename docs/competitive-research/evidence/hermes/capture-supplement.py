from playwright.sync_api import sync_playwright
from pathlib import Path
import json,base64,time
OUT=Path(__file__).parent; BASE='http://127.0.0.1:4402'; trace=[]
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 p=b.new_page(viewport={'width':1440,'height':1000})
 def save(label,kind):
  p.wait_for_timeout(1500);p.screenshot(path=str(OUT/(label+'.png')))
  (OUT/(label+'.txt')).write_text(p.locator('body').inner_text())
  trace.append({'label':label,'url':p.url,'kind':kind,'atUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
 p.goto(BASE,wait_until='domcontentloaded');p.get_by_role('button',name='对话',exact=True).click();save('16-home-chat-unconfigured','runtime')
 p.goto(BASE+'/compare?a=600519&b=600000',wait_until='domcontentloaded');p.wait_for_timeout(14000);save('17-compare-real-failure','live-query')
 p.goto(BASE+'/report/mock-danger',wait_until='domcontentloaded');p.wait_for_timeout(1600)
 p.get_by_role('button',name='查看证据',exact=True).first.click();p.keyboard.press('Escape')
 trace.append({'drawerEscapeCloses':p.locator('aside').count()==0,'focusTag':p.evaluate('document.activeElement?.tagName')})
 p.get_by_role('button',name='关闭',exact=True).click()
 try:
  with p.expect_download(timeout=20000) as pending:p.get_by_role('button',name='生成分享卡 PNG',exact=True).click()
  dl=pending.value;dl.save_as(str(OUT/'18-share-card-fixture.png'));trace.append({'downloadName':dl.suggested_filename,'kind':'fixture'})
 except Exception as e:trace.append({'downloadError':str(e)})
 # Actual product compare renderer and handlers; substituted API fixtures explicitly documented.
 healthy=p.request.get(BASE+'/api/company/mock-healthy/xray').json();warning=p.request.get(BASE+'/api/company/mock-warning/xray').json()
 def api(route):
  url=route.request.url
  if '/api/company/600519/xray' in url:route.fulfill(json=healthy)
  elif '/api/company/600000/xray' in url:route.fulfill(json=warning)
  elif '/api/search?' in url:
   code='600519' if '600519' in url else '600000';x=healthy if code=='600519' else warning
   route.fulfill(json={'found':True,'company':{'id':code,'name':x['name'],'stockCode':code}})
  else:route.continue_()
 p.route('**/api/company/*/xray',api);p.route('**/api/search?*',api)
 p.goto(BASE+'/compare?a=600519&b=600000',wait_until='domcontentloaded');p.get_by_role('button',name='LITE',exact=True).click();save('19-compare-lite-fixture-render','fixture-injection')
 p.get_by_role('button',name='PRO',exact=True).click();p.locator('table').first.scroll_into_view_if_needed();save('20-compare-pro-table-fixture-render','fixture-injection')
 (OUT/'supplement-log.json').write_text(json.dumps(trace,ensure_ascii=False,indent=2)+'\n');b.close()
