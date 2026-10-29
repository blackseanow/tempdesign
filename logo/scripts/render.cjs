/* Rebuild comparison HTML and render SVGs/scenes with Playwright. */
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'candidates/manifest.json')));
const ids = Object.keys(manifest.candidates);
const notes = {
 A1:'短指缓斜，中指下探；偏稳重的方印。', A2:'指尖向左下轻搭，斜势更明确；主推荐。',
 B1:'三枚指腹轻落，保留最少的把脉信息。', B2:'指腹随脉错落，中间略沉，节奏更松弛。',
 C1:'一笔粗按细提；16 px 自动使用三点光学稿。', C2:'回锋圆转，节奏松弛；16 px 自动使用三点光学稿。'
};
const img=(id,layout,mode,attrs='')=>`<img src="candidates/${id}/${layout}-${mode}.svg" alt="${id} ${layout} ${mode}" ${attrs}>`;
function scene(id,kind) {
 if(kind==='browser')return `<div class="scene browser" id="${id}-browser"><div class="browserbar"><i></i><i></i><i></i></div><div class="tabs"><div class="tab">${img(id,'mark','color','width="16" height="16"')}<span>咸鱼把脉了</span><span class="close">×</span></div><span>＋</span></div><div class="address">⌕ &nbsp; xianyu.example / hall</div><div class="tab-note">16 px / 浏览器标签页</div><div class="darktabs"><div class="tab">${img(id,'mark','reverse','width="16" height="16"')}<span>咸鱼把脉了</span><span class="close">×</span></div><span>＋</span></div><div class="tab-note">16 px / 函套青主题</div></div>`;
 if(kind==='navigation')return `<div class="scene navigation" id="${id}-navigation"><aside>${img(id,'vertical','color','width="44" height="181.5"')}<span class="nav-active">医馆</span><span>病历</span></aside><div class="mainview"><div class="eyebrow">医馆 · 大堂</div><h3>今日照常坐诊</h3><p>新案开始，先听一听。</p><div class="entry">开始把脉 <span>→</span></div><div class="rule"></div><span class="quiet">在诊病例</span><div class="placeholder"></div><div class="placeholder short"></div></div></div>`;
 return `<div class="scene login" id="${id}-login"><div class="login-kicker">医馆开门 · 欢迎回来</div>${img(id,'horizontal','color','width="326" height="66.3"')}<div class="login-copy">把纷繁，理成一张清楚的方子。</div><div class="login-field">你的手机号</div><div class="login-button">进入医馆</div><div class="login-bottom">先把脉，再开方</div></div>`;
}
const modeLabels={color:'朱砂 / 全彩',ink:'松烟 / 单墨',reverse:'函套青 / 反白'};
const rows=ids.map((id)=>`<section class="candidate" id="row-${id}"><div class="rowhead"><div class="number">${id}</div><h2>${manifest.candidates[id]}</h2>${id==='A2'?'<span class="recommended">主推荐</span>':''}<p>${notes[id]}</p></div><div class="rowbody"><div class="samples">${manifest.modes.map(mode=>`<div class="sample ${mode}"><div class="sample-label">${modeLabels[mode]}</div>${img(id,'mark',mode,'class="hero-mark" width="180" height="180"')}<div class="sizes">${[16,32,64].map(size=>`<figure>${img(id,'mark',mode,`width="${size}" height="${size}"`)}<figcaption>${size} px</figcaption></figure>`).join('')}</div><div class="sample-foot">主图 180 px · 原尺寸渲染</div></div>`).join('')}</div><div class="contexts">${['browser','navigation','login'].map((kind,i)=>`<div><div class="context-label">0${i+1} &nbsp; ${['浏览器标签页','左侧导航顶部','登录页标题'][i]}</div>${scene(id,kind)}</div>`).join('')}</div></div></section>`).join('');
const css=`
*{box-sizing:border-box}html,body{margin:0;background:#ECEAE1;color:#24231F;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans CJK SC",sans-serif}body{width:2400px}main{padding:52px 48px 30px}header{height:220px;display:flex;justify-content:space-between;border-bottom:2px solid #24231F}h1{font-family:"Kaiti SC","STKaiti",serif;font-size:48px;font-weight:400;letter-spacing:3px;margin:18px 0 14px}.overline{font-size:13px;letter-spacing:3px}.intro{font-size:16px;line-height:1.7;margin:0}.palette{display:flex;gap:18px;align-items:flex-start;padding-top:36px}.swatch{width:105px;font-size:12px;line-height:1.9}.swatch i{display:block;width:105px;height:36px;border:1px solid #24231F;margin-bottom:7px}.candidate{padding:24px 0 28px;border-bottom:1px solid #24231F}.rowhead{height:64px;display:flex;align-items:baseline;gap:20px}.number{font-size:28px;letter-spacing:1px;width:47px}h2{font-size:25px;font-weight:500;margin:0}.rowhead p{font-size:15px;margin-left:auto}.recommended{color:#B5382A;border:1px solid #B5382A;font-size:12px;padding:3px 8px}.rowbody{display:grid;grid-template-columns:960px 1fr;gap:32px}.samples{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.sample{height:356px;background:#F8F7F2;text-align:center;padding:14px 12px 10px}.sample.reverse{background:#1F3A4D;color:#F8F7F2}.sample-label{font-size:13px;letter-spacing:1px;margin-bottom:12px}.hero-mark{display:block;margin:0 auto}.sizes{height:95px;display:flex;justify-content:center;gap:24px;align-items:flex-end}.sizes figure{margin:0;display:flex;align-items:center;flex-direction:column;gap:7px}.sizes figcaption{font-size:11px}.sample-foot{font-size:10px;opacity:.65;padding-top:12px}.contexts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.context-label{font-size:12px;letter-spacing:1px;margin:0 0 12px;height:18px}.scene{height:326px;width:100%;overflow:hidden;border:1px solid #24231F;background:#F8F7F2}.browserbar{display:flex;gap:5px;height:34px;padding:13px;background:#ECEAE1}.browserbar i{width:6px;height:6px;border:1px solid #24231F;border-radius:50%}.tabs{display:flex;align-items:center;gap:20px;background:#ECEAE1;height:40px;padding:0 10px}.tab{display:flex;align-items:center;gap:9px;background:#F8F7F2;width:232px;height:38px;padding:0 12px;font-size:12px;border:1px solid #24231F;border-bottom:0}.close{margin-left:auto}.address{background:#ECEAE1;border:1px solid #24231F;margin:12px;height:30px;padding:7px 12px;font-size:11px}.tab-note{font-size:12px;margin:17px 16px 22px}.darktabs{display:flex;align-items:center;gap:20px;background:#1F3A4D;color:#F8F7F2;height:50px;padding:10px 10px 0}.darktabs .tab{background:#1F3A4D;color:#F8F7F2;border-color:#F8F7F2}.navigation{display:flex;background:#ECEAE1}.navigation aside{flex:0 0 78px;background:#1F3A4D;display:flex;flex-direction:column;align-items:center;padding:15px 0;gap:17px;color:#F8F7F2;font-family:"STKaiti",serif}.navigation aside>span{writing-mode:vertical-rl;font-size:14px;letter-spacing:3px}.nav-active{border-left:1px solid #F8F7F2;padding-left:10px;margin-left:-11px}.mainview{padding:27px 22px;flex:1}.eyebrow{font-size:10px;letter-spacing:2px}h3{font-size:20px;font-family:"STKaiti",serif;font-weight:400;margin:20px 0 9px}.mainview p{font-size:12px;margin:0 0 22px}.entry{font-size:14px;padding:12px;background:#F8F7F2;border:1px solid #24231F}.entry span{float:right}.rule{height:1px;background:#24231F;margin:24px 0 12px}.quiet{font-size:10px}.placeholder{height:5px;background:#24231F;opacity:.18;margin-top:14px;width:100%}.short{width:65%;margin-top:10px}.login{text-align:center;padding:26px 20px}.login-kicker{font-size:11px;letter-spacing:2px;margin:0 0 18px}.login img{max-width:100%;height:auto;display:block;margin:auto}.login-copy{font-size:11px;margin:14px 0 24px}.login-field{font-size:12px;border:1px solid #24231F;height:36px;line-height:34px;text-align:left;padding:0 12px}.login-button{margin-top:9px;background:#1F3A4D;color:#F8F7F2;height:36px;line-height:36px;font-size:13px}.login-bottom{font-size:10px;margin-top:17px}footer{font-size:12px;display:flex;justify-content:space-between;padding-top:25px;line-height:1.8}img{vertical-align:middle}
`;
const palette=Object.entries({朱砂:'#B5382A',素笺:'#F8F7F2',松烟墨:'#24231F',函套青:'#1F3A4D',竹纸:'#ECEAE1'}).map(([n,c])=>`<div class="swatch"><i style="background:${c}"></i>${n}<br>${c}</div>`).join('');
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>咸鱼把脉了 · Logo 候选联系表</title><style>${css}</style><main><header><div><div class="overline">XIANYU BAMAI · IDENTITY STUDIES / 2026.10</div><h1>方寸之间，三指搭脉。</h1><p class="intro">咸鱼把脉了 · 六稿对照　/　A 三指按脉 · B 寸关尺 · C 一笔搭脉<br>所有标志及字标均为独立 SVG；五字由霞鹜文楷真实字形转为路径。</p></div><div class="palette">${palette}</div></header>${rows}<footer><span>16 / 32 / 64 / 180 px · Playwright / Chromium · DPR 1<br>请按 100% 查看小尺寸；C 在 ≤24 px 切换三点光学稿，≥32 px 保留一笔回锋。</span><span>54 份主 SVG + 6 份 C 固定光学稿 · 全部独立可用<br>字形来源：lxgw-wenkai-webfont 1.7.0 / Regular · OFL 1.1</span></footer></main></html>`;
fs.writeFileSync(path.join(root,'index.html'),html);
(async()=>{
 const out=path.join(root,'screenshots');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const page=await browser.newPage({viewport:{width:2400,height:1200},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**/*',r=>r.abort());
 await page.goto('file://'+path.join(root,'index.html'));
 await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode()));await document.fonts.ready;});
 await page.screenshot({path:path.join(out,'sheet.png'),fullPage:true});
 for(const id of ids){
  await page.locator('#row-'+id).screenshot({path:path.join(root,'work',id+'-review.png')});
  for(const kind of ['browser','navigation','login']){
   fs.mkdirSync(path.join(out,'scenes'),{recursive:true});
   await page.locator('#'+id+'-'+kind).screenshot({path:path.join(out,'scenes',id+'-'+kind+'.png')});
  }
 }
 const missing=await page.evaluate(()=>[...document.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src));
 const overflow=await page.evaluate(()=>[...document.querySelectorAll('.scene,.sample')].filter(e=>e.scrollWidth>e.clientWidth||e.scrollHeight>e.clientHeight).map(e=>e.className));
 for(const id of ids)for(const mode of manifest.modes)for(const size of manifest.sizes){
  const target=path.join(out,'marks',id);fs.mkdirSync(target,{recursive:true});
  await page.setViewportSize({width:size,height:size});
  const src=fs.readFileSync(path.join(root,'candidates',id,'mark-'+mode+'.svg'),'utf8');
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${src}`);
  await page.screenshot({path:path.join(target,mode+'-'+size+'.png'),omitBackground:true});
 }
 const pixelHtml=`<html><style>body{margin:0;padding:30px;background:#ECEAE1;font:14px sans-serif;color:#24231F}h1{font-size:24px;font-weight:400}.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:20px}.cell{padding:20px;background:#F8F7F2}img{display:block;margin:16px 0}.zoom{width:128px;height:128px;image-rendering:pixelated}.small{width:16px;height:16px}.mode{display:flex;gap:15px}</style><body><h1>16 px 原像素 / 8× 最近邻放大检查</h1><p>放大仅用于查看像素连接；上方小图才是实际大小。C1 / C2 为同一 SVG 在 ≤24 px 时自动显示的光学稿。</p><div class="grid">${ids.map(id=>`<div class="cell"><b>${id}</b>${manifest.modes.map(mode=>`<div>${mode}<img class="small" src="marks/${id}/${mode}-16.png"><img class="zoom" src="marks/${id}/${mode}-16.png"></div>`).join('')}</div>`).join('')}</div></body></html>`;
 fs.writeFileSync(path.join(out,'pixels-16.html'),pixelHtml);
 await page.setViewportSize({width:1200,height:900});await page.goto('file://'+path.join(out,'pixels-16.html'));
 await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
 await page.screenshot({path:path.join(out,'pixels-16.png'),fullPage:true});
 fs.writeFileSync(path.join(out,'render-report.json'),JSON.stringify({renderer:'Playwright / Chromium',browserVersion:browser.version(),deviceScaleFactor:1,markPNGs:72,scenePNGs:18,contactSheet:'sheet.png',smallSizeSheet:'pixels-16.png',missingImages:missing,overflow,pageErrors:errors},null,2)+'\n');
 await browser.close();
 console.log(JSON.stringify({markPNGs:72,scenePNGs:18,missing,overflow,errors}));
 if(missing.length||overflow.length||errors.length)process.exitCode=1;
})();
