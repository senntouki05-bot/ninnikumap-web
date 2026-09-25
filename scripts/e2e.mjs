/* 実ブラウザでの動作確認（地図の描画・操作・レイアウト崩れ・コンソールエラー）
   使い方: node scripts/serve.mjs & node scripts/e2e.mjs [port]
   本番に当てる: node scripts/e2e.mjs https://ninnikumap.com
     ⚠️ `_headers` の CSP はローカルの serve.mjs では効かない＝本番でしか検証できない。
        フォント等が CSP で落ちていないかは、必ず一度は本番URLに当てて確かめること。
   スクショは tmp/shots/ に出る（gitには入れない） */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ARG = process.argv[2] || '8799';
const BASE = /^https?:\/\//.test(ARG) ? ARG.replace(/\/$/, '') : `http://127.0.0.1:${Number(ARG)}`;
const SHOTS = path.join(process.cwd(), 'tmp', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const PW = path.join(process.env.HOME, '.claude/skills/design-review/node_modules/playwright/index.mjs');
const { chromium } = await import(PW);

const fails = [];
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => { console.log('  ✗ ' + m); fails.push(m); };

const browser = await chromium.launch();

async function newPage(w, h) {
  /* ignoreHTTPSErrors: _headers の CSP を再現するローカル https（自己署名）にも当てられるようにする。
     本番の証明書エラーを見逃す用途ではない（本番は curl で別途 200 を確認している）。 */
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
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

/* ---- 1b. 一番混んでいる地域で、地図上ににんにくのマークだけが出ているか ----
   方針: 地図に店名は載せない（店名は左のリストと詳細カードで読ませる）。
   ここは「全店ぶんのピンが地図の中に出ていて、店名テキストは1件も出ていない」ことを機械で押さえる。
   ⚠️ 当たり判定ボタンの title / aria-label は読み上げ用に店名を持つ（画面には出ない）ので
      visible text だけを見ること。innerText を使うと非表示テキストを拾わない。 */
{
  const shops = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'shops.json'), 'utf8'));
  const counts = {};
  shops.forEach((s) => { counts[s.region] = (counts[s.region] || 0) + 1; });
  const densest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const names = shops.filter((s) => s.region === densest).map((s) => s.name);

  const page = await newPage(1440, 900);
  await page.goto(`${BASE}/#/area/${densest}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const r = await page.evaluate((names) => {
    const pins = [...document.querySelectorAll('.nm-pin')];
    const stageEl = pins[0]?.closest('[style*="perspective"]');
    const stage = stageEl?.getBoundingClientRect();
    const outside = stage ? pins.filter((el) => {
      const b = el.getBoundingClientRect();
      return b.left < stage.left - 2 || b.right > stage.right + 2 || b.top < stage.top - 2 || b.bottom > stage.bottom + 2;
    }).length : 0;
    const stageText = stageEl ? stageEl.innerText : '';
    return {
      pins: pins.length, outside,
      legacyLabels: document.querySelectorAll('.nm-label').length,
      shown: names.filter((n) => stageText.includes(n)),
    };
  }, names);
  r.pins === names.length ? ok(`最密地域(${densest}) ${r.pins}軒: ピンが全部出ている`) : bad(`${densest}: ${names.length}軒に対しピン${r.pins}個`);
  r.legacyLabels === 0 ? ok(`${densest}: 地図上に店名パネルが無い`) : bad(`${densest}: 店名パネルが ${r.legacyLabels} 個残っている`);
  r.shown.length === 0 ? ok(`${densest}: 地図上に店名テキストが出ていない`) : bad(`${densest}: 地図上に店名が出ている — ${r.shown.slice(0, 3).join(' / ')}`);
  r.outside === 0 ? ok(`${densest}: ピンが地図の外にはみ出していない`) : bad(`${densest}: ピン ${r.outside} 個が地図の外`);
  await page.screenshot({ path: path.join(SHOTS, `04-densest-${densest}.png`) });
  await page.close();
}

/* ---- 1c. 店をタップすると「にんにくレベル」が出て、コンボ演出は出ないか ---- */
{
  const page = await newPage(1440, 900);
  await page.goto(BASE + '/#/area/kanto', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);

  const before = await page.locator('.nm-lvbadge').count();
  before === 0 ? ok('タップ前は にんにくレベル が出ていない') : bad(`タップ前から にんにくレベル が ${before} 個出ている`);

  // 2連続タップ（旧コンボ演出の発火条件）
  const hits = page.locator('#nm-app button[title]');
  await hits.nth(0).click();
  await page.waitForTimeout(200);
  await hits.nth(1).click();
  await page.waitForTimeout(900);

  const badgeCount = await page.locator('.nm-lvbadge').count();
  badgeCount === 1 ? ok('タップ後に にんにくレベル が出た') : bad(`にんにくレベル が ${badgeCount} 個`);
  if (badgeCount) {
    const txt = await page.locator('.nm-lvbadge').innerText();
    /にんにくレベル/.test(txt) ? ok(`にんにくレベルの中身: ${txt.replace(/\n/g, ' / ')}`) : bad(`にんにくレベルの見出しが無い: ${txt}`);
    const marks = await page.locator('.nm-lvbadge img').count();
    marks >= 1 && marks <= 3 ? ok(`にんにくマーク ${marks} 個（1〜3）`) : bad(`にんにくマークが ${marks} 個`);
  }
  const stageText = await page.locator('#nm-app [style*="perspective"]').first().innerText();
  /コンボ/.test(stageText) ? bad('コンボ表示がまだ出ている') : ok('コンボ表示は出ない');

  if (page.__errors.length) bad('タップでコンソールエラー: ' + page.__errors.slice(0, 3).join(' / '));
  await page.screenshot({ path: path.join(SHOTS, '05-level-badge.png') });
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

/* ---- 5. LinkSwitch（affiliate-config.js に pid があるときだけ）----
   タグが載っているか／CSP に止められずスクリプトが実行されたか／変換されたかどうか（VC側の状態＝情報として出す）。
   ⚠️ _headers の CSP はローカルの serve.mjs では効かない＝本番URL（または CSP を再現する配信）で見る。 */
{
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  await import(pathToFileURL(path.join(process.cwd(), 'public', 'affiliate-config.js')).href);
  await import(pathToFileURL(path.join(process.cwd(), 'public', 'affiliate.js')).href);
  const AFF = globalThis.NM_AFF;
  const cfg = AFF.loadConfig();
  const pid = AFF.linkSwitchPid(cfg);
  const svcs = AFF.linkSwitchServices(cfg);
  if (pid) {
    const shops = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'shops.json'), 'utf8'));
    const target = shops.find((x) => x.official_url && svcs.includes(AFF.serviceOf(x.official_url)));
    const page = await newPage(1280, 900);
    const url = BASE + (target ? `/shop/${target.slug}/` : '/about/');
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const tag = await page.locator(`script[src="${AFF.linkSwitchSrc}"]`).count();
    tag === 1 ? ok('LinkSwitch のタグが載っている') : bad(`LinkSwitch のタグが ${tag} 個`);
    const csp = page.__errors.filter((e) => /Content Security Policy|valuecommerce|imgvc/i.test(e));
    csp.length === 0 ? ok('LinkSwitch 関連の CSP／読み込みエラーなし') : bad('LinkSwitch がブロックされた: ' + csp[0].slice(0, 160));
    const ran = await page.evaluate(() => typeof window.dalDynamicProcess === 'function');
    ran ? ok('vcdal.js が実行された（dalDynamicProcess が生えた）') : bad('vcdal.js が実行されていない');
    if (target) {
      /* ⚠️ vcdal.js は走査したリンクに data-nodal／vcdaldp-fin を付け、変換したら href も書き換える。
         href や data-nodal で探すと処理後に見失うので、ビルド時に付けた data-svc で探す。 */
      const info = await page.evaluate(() => [...document.querySelectorAll('.nm-table a[data-svc]')].map((a) => ({ href: a.getAttribute('href'), svc: a.getAttribute('data-svc'), fin: a.hasAttribute('vcdaldp-fin'), nodal: a.hasAttribute('data-nodal'), rel: a.getAttribute('rel') || '' })));
      const link = info.find((l) => svcs.includes(l.svc));
      if (!link) bad(`${target.name} のページに送客リンクが無い`);
      else {
        /\bsponsored\b/.test(link.rel) ? ok('変換対象のリンクに rel="sponsored"') : bad('変換対象のリンクに sponsored が無い');
        (link.fin || link.nodal) ? ok('LinkSwitch がリンクを走査した') : bad('LinkSwitch がリンクを走査していない');
        console.log(`  ℹ 変換${/valuecommerce\.com/.test(link.href) ? 'された' : 'されていない（VC 側で提携・LinkSwitch が有効になっていない可能性）'}: ${link.href.slice(0, 90)}`);
      }
      const srcNodal = await page.evaluate(() => [...document.querySelectorAll('.nm-note a[target="_blank"]')].every((a) => a.hasAttribute('data-nodal')));
      srcNodal ? ok('出典リンクは data-nodal で変換対象外') : bad('出典リンクに data-nodal が無い');

      /* 地図アプリ側: 詳細カードのリンクは後から描画される。affiliate.js の MutationObserver が
         dalDynamicProcess() を呼んで走査させているか（走査済みの印 vcdaldp-fin / data-nodal が付く）。 */
      await page.goto(`${BASE}/#/shop/${target.id}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
      const card = await page.evaluate(() => [...document.querySelectorAll('.nm-detail-card a[data-svc]')].map((a) => ({ href: a.getAttribute('href'), svc: a.getAttribute('data-svc'), fin: a.hasAttribute('vcdaldp-fin'), nodal: a.hasAttribute('data-nodal'), rel: a.getAttribute('rel') || '', text: a.textContent, mark: (a.nextElementSibling && a.nextElementSibling.classList.contains('nm-ad-mark')) ? a.nextElementSibling.textContent : '' })));
      const cl = card.find((l) => svcs.includes(l.svc));
      if (!cl) bad(`詳細カードに ${target.name} の送客リンクが無い: ${JSON.stringify(card).slice(0, 200)}`);
      else {
        (cl.fin || cl.nodal) ? ok('詳細カードの送客リンクも LinkSwitch が走査した（後から描画したリンクの再走査が効いている）') : bad('詳細カードの送客リンクが走査されていない（MutationObserver→dalDynamicProcess が効いていない）');
        /\bsponsored\b/.test(cl.rel) ? ok('詳細カードの送客リンクに sponsored') : bad('詳細カードの送客リンクに sponsored が無い');
        const shopRec = shops.find((x) => x.id === target.id);
        const wantLabel = cl.svc === 'tabelog' ? (shopRec.tabelog_booking ? '食べログで予約' : '食べログで見る') : '公式サイト';
        cl.text.trim() === wantLabel ? ok(`詳細カードのボタン文言「${wantLabel}」（「広告」は文言に混ぜない）`) : bad(`詳細カードのボタン文言が「${cl.text.trim()}」（期待「${wantLabel}」）`);
        cl.mark === '広告' ? ok('詳細カードの送客リンクの横に「広告」表示') : bad('詳細カードの送客リンクの横に「広告」が無い');
      }
      const cspCard = page.__errors.filter((e) => /Content Security Policy|valuecommerce|imgvc/i.test(e));
      cspCard.length === 0 ? ok('地図アプリでも LinkSwitch 関連の CSP エラーなし') : bad('地図アプリで LinkSwitch がブロックされた: ' + cspCard[0].slice(0, 160));
    }
    await page.close();
  } else {
    ok('LinkSwitch 未設定（タグなし）');
  }

  /* 食べログの文言: 予約できる店だけ「食べログで予約」、できない店は「食べログで見る」（地図アプリの詳細カード） */
  {
    const shops = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'shops.json'), 'utf8'));
    for (const want of [true, false]) {
      const t = shops.find((x) => x.tabelog_url && x.tabelog_booking === want);
      if (!t) continue;
      const page = await newPage(1280, 900);
      await page.goto(`${BASE}/#/shop/${t.id}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      const label = await page.evaluate(() => { const a = document.querySelector('.nm-detail-card a[data-svc="tabelog"]'); return a ? a.textContent.trim() : null; });
      const exp = want ? '食べログで予約' : '食べログで見る';
      label === exp ? ok(`${t.name}（予約${want ? 'できる' : 'なし'}）→「${exp}」`) : bad(`${t.name}（予約${want ? 'できる' : 'なし'}）の文言が「${label}」`);
      await page.close();
    }
  }

  /* バナーが広告ブロッカー等で止められたとき: 「広告」の札と空の枠を残さず、募集表示に戻るか */
  if (Object.keys(cfg.banners || {}).some((k) => AFF.banner(k, cfg))) {
    const page = await newPage(1440, 900);
    await page.route(/ad\.jp\.ap\.valuecommerce\.com|i\.imgvc\.com/, (r) => r.abort('blockedbyclient'));
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const st = await page.evaluate(() => ({ banners: document.querySelectorAll('.nm-banner').length, marks: [...document.querySelectorAll('#nm-app .nm-ad-mark')].filter((e) => !e.closest('.nm-detail-card')).length, placeholders: [...document.querySelectorAll('#nm-app a')].filter((a) => /468 × 60|300 × 250/.test(a.textContent)).length }));
    st.banners === 0 && st.marks === 0 && st.placeholders >= 2 ? ok('バナーを止められたら募集表示に戻る（空の枠・「広告」の札を残さない）') : bad(`バナーを止めたときの表示が崩れている: ${JSON.stringify(st)}`);
    await page.close();
  }

  /* 画像バナー（affiliate-config.js の banners）: 地図ページの広告枠に出るか／画像が実際に読み込めたか
     （CSP で止まると枠は出るが画像が 0px になる）／sponsored と「広告」表示 */
  const slots = Object.keys(cfg.banners || {}).filter((k) => AFF.banner(k, cfg));
  if (slots.length) {
    for (const [w, h, label] of [[1440, 900, 'desktop'], [390, 844, 'iphone']]) {
      const page = await newPage(w, h);
      await page.goto(BASE + '/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      const bs = await page.evaluate(() => [...document.querySelectorAll('.nm-banner')].map((el) => {
        const a = el.querySelector('a'); const img = el.querySelector('img'); const r = img ? img.getBoundingClientRect() : null;
        return { href: a && a.getAttribute('href'), rel: a && a.getAttribute('rel'), src: img && img.getAttribute('src'), nw: img ? img.naturalWidth : 0, nh: img ? img.naturalHeight : 0, w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0, wrap: Math.round(el.getBoundingClientRect().width), mark: (el.querySelector('.nm-ad-mark') || {}).textContent || '' };
      }));
      bs.length === slots.length ? ok(`${label}: 広告バナー ${bs.length} 枠が出た`) : bad(`${label}: 広告バナーが ${bs.length} 枠（設定は ${slots.length}）`);
      for (const b of bs) {
        const id = (b.src || '').match(/pid=(\d+)/)?.[1] || '?';
        (b.nw > 1) ? ok(`${label}: バナー pid=${id} の画像が読み込めた（${b.w}×${b.h}px で表示）`) : bad(`${label}: バナー pid=${id} の画像が読み込めていない（CSP か VC 側）`);
        /\bsponsored\b/.test(b.rel || '') && b.mark === '広告' ? ok(`${label}: バナー pid=${id} に sponsored と「広告」`) : bad(`${label}: バナー pid=${id} の広告表示が欠けている`);
        /* 大きさ: 枠の幅いっぱい、ただし元の大きさ×maxScale まで。縦横比は保つ */
        const conf = Object.values(cfg.banners).find((x) => String(x.pid) === id);
        const bn = conf && AFF.banner(Object.keys(cfg.banners).find((k) => String(cfg.banners[k].pid) === id), cfg);
        if (bn && b.nw > 1) {
          const want = Math.min(b.wrap, Math.round(bn.w * bn.maxScale));
          const ratioOk = Math.abs(b.w / b.h - bn.w / bn.h) < 0.05;
          (Math.abs(b.w - want) <= 2 && ratioOk) ? ok(`${label}: バナー pid=${id} は ${b.w}×${b.h}px（元 ${bn.w}×${bn.h}・上限×${bn.maxScale}・縦横比そのまま）`) : bad(`${label}: バナー pid=${id} の大きさが ${b.w}×${b.h}（期待 幅${want}・比 ${bn.w}:${bn.h}）`);
        }
      }
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      over <= 1 ? ok(`${label}: バナーを入れても横スクロールなし`) : bad(`${label}: バナーで横に ${over}px はみ出した`);
      const errs = page.__errors.filter((e) => /Content Security Policy|valuecommerce|imgvc/i.test(e));
      errs.length === 0 ? ok(`${label}: バナー関連の CSP／読み込みエラーなし`) : bad(`${label}: ${errs[0].slice(0, 160)}`);
      await page.screenshot({ path: path.join(SHOTS, `20-banner-${label}.png`) });
      await page.close();
    }
  }
}

await browser.close();
console.log(fails.length ? `\n不合格 ${fails.length} 件` : '\nE2E すべて合格');
process.exit(fails.length ? 1 : 0);
