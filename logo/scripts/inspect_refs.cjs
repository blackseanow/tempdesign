const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
  const page = await browser.newPage({ viewport: {width:1440,height:1050}, deviceScaleFactor:1});
  await page.route('https://**/*',route=>route.abort());
  for(const file of ['xianyu-demo-v2','xianyu-illustrations']) {
    await page.goto('file://' + path.resolve(__dirname,'../../ref',file+'.html'));
    await page.screenshot({path:path.resolve(__dirname,'../work/ref',file+'.png'),fullPage:file.includes('illustrations')});
  }
  await browser.close();
})();
