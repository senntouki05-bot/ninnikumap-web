/* 食べログでネット予約できるかを確かめ直す（ネットワークに出る・食べログを1軒1.2秒間隔で開く）。
   使い方: npm run tabelog:booking            … 今のデータとの食い違いを表示するだけ
           npm run tabelog:booking -- --write … data/shops.json の tabelog_booking を書き換える
   ★判定: 店ページに予約カレンダー（.p-booking-calendar）か「予約する」ボタン（/booking/form/new）があるか。
     ⚠️ ページ上の「ネット予約」という文字では判定しない＝食べログ共通のメニューにも出るので全店「あり」になる（2026-09-25 実測）。
     ⚠️ title の「〇〇のご予約」でも判定しない＝予約を受けていないのに付いている店があった（ka09）。
   「食べログで予約」の表示はこの値で出し分ける。予約を止めた店に「予約」と出し続けないよう、ときどき回す。 */
import fs from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');
const FILE = path.join(process.cwd(), 'data', 'shops.json');
const PW = path.join(process.env.HOME, '.claude/skills/design-review/node_modules/playwright/index.mjs');
const { chromium } = await import(PW);

const raw = fs.readFileSync(FILE, 'utf8');
const shops = JSON.parse(raw);
const browser = await chromium.launch();
const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', locale: 'ja-JP' });
let changed = 0, failed = 0, yes = 0, n = 0;
for (const s of shops.filter((x) => x.tabelog_url)) {
  const page = await ctx.newPage();
  try {
    const res = await page.goto(s.tabelog_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!res || res.status() !== 200) throw new Error(`HTTP ${res && res.status()}`);
    await page.waitForTimeout(900);
    const ok = await page.evaluate(() => !!document.querySelector('.p-booking-calendar, [class*="p-booking-calendar"], a.js-booking-form-open, a[href*="/booking/form/new"]'));
    n++; if (ok) yes++;
    if (s.tabelog_booking !== ok) {
      changed++;
      console.log(`  ${s.tabelog_booking === undefined ? '未設定' : s.tabelog_booking ? '予約あり' : '予約なし'} → ${ok ? '予約あり' : '予約なし'} | ${s.id} ${s.name}`);
      s.tabelog_booking = ok;
    }
  } catch (e) {
    failed++;   // 取れなかった店は書き換えない（fail-safe＝前の値のまま）
    console.log(`  取得失敗（前の値のまま）| ${s.id} ${s.name} | ${e.message.slice(0, 60)}`);
  }
  await page.close();
  await new Promise((r) => setTimeout(r, 1200));
}
await browser.close();
console.log(`\nネット予約できる ${yes} / ${n}軒・変化 ${changed}・取得失敗 ${failed}`);
if (WRITE && changed) {
  fs.writeFileSync(FILE, JSON.stringify(shops, null, 2) + (raw.endsWith('\n') ? '\n' : ''));
  console.log('data/shops.json を更新した → npm run deploy で反映');
} else if (changed) console.log('（--write を付けると data/shops.json に書き込む）');
