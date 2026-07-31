/* OGP画像とアイコンPNGを生成する（headless Chromiumでレンダリング）。
   playwright は design-review スキルに同梱のものを借りる。
   使い方: node scripts/make-images.mjs
   ※ 生成物は public/assets/ に入るのでビルドの前に1回走らせればよい（毎回は不要） */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public', 'assets');
const PW = path.join(process.env.HOME, '.claude/skills/design-review/node_modules/playwright/index.mjs');

const shops = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'shops.json'), 'utf8'));
const prefs = new Set(shops.map((s) => s.area.split(/[ 　]/)[0]));
const garlic = fs.readFileSync(path.join(OUT, 'garlic.svg'), 'utf8');
const shadow = fs.readFileSync(path.join(OUT, 'garlic-shadow.svg'), 'utf8');
const b64 = (s) => 'data:image/svg+xml;base64,' + Buffer.from(s).toString('base64');

const FONTS = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@700;900&family=M+PLUS+Rounded+1c:wght@500;800&display=swap" rel="stylesheet">`;

const ogHtml = `<!doctype html><meta charset="utf-8">${FONTS}
<style>
  html,body{margin:0;padding:0}
  body{width:1200px;height:630px;overflow:hidden;
    background:radial-gradient(120% 80% at 50% 0%,#f7ecda 0%,#e9d9c0 60%,#dfcbae 100%);
    font-family:'M PLUS Rounded 1c','Hiragino Maru Gothic ProN',sans-serif;color:#4a3a2a;
    display:flex;align-items:center;justify-content:center;position:relative}
  .deco{position:absolute;pointer-events:none}
  .wrap{display:flex;align-items:center;gap:52px;z-index:2;
    background:#fffaf0;border:8px solid #cbb392;border-radius:44px;padding:46px 66px;
    box-shadow:0 16px 0 #d5bd9c,0 30px 50px rgba(90,64,36,.22)}
  h1{font-family:'Zen Maru Gothic',sans-serif;font-weight:900;font-size:74px;line-height:1.1;margin:0;
    text-shadow:0 3px 0 #fff8ea,0 6px 0 rgba(150,120,80,.25)}
  .sub{font-size:25px;color:#8a7358;margin-top:18px;line-height:1.6;font-weight:500}
  .count{display:inline-flex;align-items:flex-end;gap:10px;margin-top:22px;
    background:#fff2e4;border:4px solid #e6c8a8;border-radius:26px;padding:10px 24px 8px}
  .count b{font-family:'Zen Maru Gothic',sans-serif;font-weight:900;font-size:52px;line-height:1;color:#d0663c}
  .count span{font-size:20px;color:#8a7358;padding-bottom:7px}
</style>
<img class="deco" src="${b64(shadow)}" style="right:-70px;top:-60px;width:340px;opacity:.16">
<img class="deco" src="${b64(shadow)}" style="left:-90px;bottom:-110px;width:400px;opacity:.13;transform:scaleX(-1)">
<div class="wrap">
  <img src="${b64(garlic)}" style="width:232px;flex:none">
  <div>
    <h1>にんにくマップ</h1>
    <div class="sub">全国のにんにく専門店・にんにく料理の名店を<br>地図から探せるサイト</div>
    <div class="count"><b>${shops.length}</b><span>軒／${prefs.size}都道府県</span></div>
  </div>
</div>`;

const iconHtml = (px) => `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0}body{width:${px}px;height:${px}px;background:#efe2cd;display:flex;align-items:center;justify-content:center}
img{width:${Math.round(px * 0.76)}px}</style><img src="${b64(garlic)}">`;

const { chromium } = await import(PW);
const browser = await chromium.launch();

async function shot(html, w, h, file) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, file) });
  await page.close();
  const kb = (fs.statSync(path.join(OUT, file)).size / 1024).toFixed(1);
  console.log(`  ${file}  ${w}x${h}  ${kb}KB`);
}

await shot(ogHtml, 1200, 630, 'og.png');
await shot(iconHtml(180), 180, 180, 'apple-touch-icon.png');
await shot(iconHtml(512), 512, 512, 'icon-512.png');
await browser.close();
console.log('画像生成 完了');
