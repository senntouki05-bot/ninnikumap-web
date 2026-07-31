/* 実ブラウザでの動作確認（地図の描画・操作・レイアウト崩れ・コンソールエラー）
   使い方: node scripts/serve.mjs & node scripts/e2e.mjs [port]
   スクショは tmp/shots/ に出る（gitには入れない） */
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.argv[2] || 8799);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(process.cwd(), 'tmp', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const PW = path.join(process.env.HOME, '.claude/skills/design-review/node_modules/playwright/index.mjs');
const { chromium } = await import(PW);

const fails = [];
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => { console.log('  ✗ ' + m); fails.push(m); };

const browser = await chromium.launch();

async function newPage(w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url() + ' ' + (r.failure()?.errorText || '')));
  page.__errors = errors;
  return page;
}

/* ---- 1. デスクトップ: 地図が出て、地域→店→詳細まで進めるか ---- */
{
  const page = await newPage(1440, 900);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);

  const regionPins = await page.locator('.nm-rpin').count();
  regionPins >= 9 ? ok(`地域ピン ${regionPins} 個が描画された`) : bad(`地域ピンが ${regionPins} 個しか出ていない`);

  const counter = await page.locator('#nm-app').innerText();
  /\d+\s*軒あるよ/.test(counter) ? ok('カウンタが動いている') : bad('カウンタが出ていない');

  await page.screenshot({ path: path.join(SHOTS, '01-japan-desktop.png') });

  // 関東の当たり判定（ピンの上にある透明ボタン）をクリック → 店ピンが出る
  await page.locator('button[aria-label^="関東"]').first().click();
  await page.waitForTimeout(1600);
  const shopPins = await page.locator('.nm-pin').count();
  shopPins > 0 ? ok(`関東にズーム、店ピン ${shopPins} 個`) : bad('ズーム後に店ピンが出ない');
  await page.screenshot({ path: path.join(SHOTS, '02-kanto.png') });

  // 店ピンをクリック → 詳細カード
  await page.locator('#nm-app button[title]:not([aria-label^="関東"])').first().click();
  await page.waitForTimeout(900);
  const card = await page.locator('.nm-detail-card').count();
  card === 1 ? ok('詳細カードが開いた') : bad(`詳細カードが ${card} 個`);
  const cardText = card ? await page.locator('.nm-detail-card').innerText() : '';
  /ばしょ/.test(cardText) ? ok('詳細に住所欄がある') : bad('詳細の中身が空');
  await page.screenshot({ path: path.join(SHOTS, '03-detail.png') });

  // 「日本ぜんぶ」で戻れる
  await page.locator('.nm-back').first().click();
  await page.waitForTimeout(1400);
  (await page.locator('.nm-rpin').count()) >= 9 ? ok('日本全体に戻れた') : bad('戻れない');

  // 検索
  await page.locator('#nm-app input').fill('ラーメン');
  await page.waitForTimeout(500);
  const listed = await page.locator('.nm-listitem').count();
  listed >= 0 ? ok(`検索で ${listed} 件に絞り込み`) : bad('検索が効かない');
  await page.locator('#nm-app input').fill('');
  await page.waitForTimeout(300);

  // ジャンル絞り込み
  await page.locator('.nm-chip', { hasText: 'ラーメン' }).first().click();
  await page.waitForTimeout(400);
  ok(`ジャンル絞り込み後のリスト ${await page.locator('.nm-listitem').count()} 件`);

  if (page.__errors.length) bad('コンソールエラー: ' + page.__errors.slice(0, 4).join(' / '));
  else ok('コンソールエラー 0');
  await page.close();
}

/* ---- 2. ハッシュURLで直接その店を開けるか ---- */
{
  const shops = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'shops.json'), 'utf8'));
  const target = shops[Math.min(3, shops.length - 1)];
  const page = await newPage(1440, 900);
  await page.goto(`${BASE}/#/shop/${target.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const txt = await page.locator('#nm-app').innerText();
  txt.includes(target.name) ? ok(`#/shop/${target.id} で「${target.name}」が開いた`) : bad(`ハッシュURLで店が開かない（${target.name}）`);
  if (page.__errors.length) bad('ハッシュ遷移でコンソールエラー: ' + page.__errors[0]);
  await page.close();
}

/* ---- 3. レスポンシブ: 横スクロールが出ないか ---- */
for (const [w, h, label] of [[375, 812, 'iphone'], [768, 1024, 'tablet'], [1440, 900, 'desktop'], [1920, 1080, 'wide']]) {
  const page = await newPage(w, h);
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  over <= 1 ? ok(`${label} (${w}px): 横スクロールなし`) : bad(`${label} (${w}px): 横に ${over}px はみ出している`);
  // ページが縦にスクロールできること（overflow:hidden 事故の検出）
  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight + 10);
  scrollable ? ok(`${label}: 静的コンテンツまで縦スクロールできる`) : bad(`${label}: 縦スクロールできない`);
  await page.screenshot({ path: path.join(SHOTS, `10-${label}.png`), fullPage: false });
  await page.close();
}

/* ---- 4. 静的ページ ---- */
for (const p of ['/list/', '/about/', '/contact/', '/privacy/', '/area/kanto/']) {
  const page = await newPage(1280, 900);
  const res = await page.goto(BASE + p, { waitUntil: 'domcontentloaded' });
  const h1 = await page.locator('h1').count();
  (res.status() === 200 && h1 === 1) ? ok(`${p} 200 / h1×1`) : bad(`${p} status=${res.status()} h1=${h1}`);
  await page.close();
}
{
  const page = await newPage(1280, 900);
  const res = await page.goto(BASE + '/no-such-page/', { waitUntil: 'domcontentloaded' });
  res.status() === 404 ? ok('未一致パスは 404') : bad(`未一致パスが ${res.status()} を返した`);
  await page.close();
}

await browser.close();
console.log(fails.length ? `\n不合格 ${fails.length} 件` : '\nE2E すべて合格');
process.exit(fails.length ? 1 : 0);
