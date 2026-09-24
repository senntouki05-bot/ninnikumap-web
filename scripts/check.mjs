/* 出荷前チェック（ビルド生成物に対する機械検査）
   1. 全ページのHTMLが壊れていないか（title/canonical/description/h1 が1つずつある）
   2. サイト内リンクの参照先が実在するか（リンク切れゼロ）
   3. sitemap.xml の全URLが実在し、逆に実在ページが漏れていないか
   4. JSON-LD が JSON として妥当か
   5. data.js の店数が data/shops.json と一致するか（静的HTMLと地図の食い違い防止）
   6. robots.txt が /data.js /core.js /app.js /styles.css を塞いでいないか
      （robots.txt はレンダリング時のサブリソース取得にも効くため、塞ぐと地図が空で評価される）
*/
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const PUB = path.join(ROOT, 'public');
const errs = [], warns = [];
const fail = (m) => errs.push(m);
const warn = (m) => warns.push(m);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else out.push(f);
  }
  return out;
}

const files = walk(PUB);
const htmls = files.filter((f) => f.endsWith('.html'));
const relOf = (f) => '/' + path.relative(PUB, f).split(path.sep).join('/');

/* URL → 実ファイルへの解決（Pages と同じ規則） */
function resolves(url) {
  if (/^(https?:|mailto:|tel:|#)/.test(url)) return true;
  const clean = decodeURIComponent(url.split('#')[0].split('?')[0]);
  if (!clean) return true;
  if (!clean.startsWith('/')) return null; // 相対パスは使わない方針
  const direct = path.join(PUB, clean);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return true;
  if (fs.existsSync(path.join(direct, 'index.html'))) return true;
  return false;
}

/* ---- 1〜4: ページ単位 ---- */
for (const f of htmls) {
  const rel = relOf(f);
  const html = fs.readFileSync(f, 'utf8');

  const nTitle = (html.match(/<title>/g) || []).length;
  if (nTitle !== 1) fail(`${rel}: <title> が ${nTitle} 個`);
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
  if (title.length > 70) warn(`${rel}: titleが${title.length}字（検索結果で切れる）: ${title}`);

  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (!desc) fail(`${rel}: description が無い`);
  else if (desc.length > 140) warn(`${rel}: descriptionが${desc.length}字`);

  if (rel !== '/404.html') {
    const canon = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
    if (!canon) fail(`${rel}: canonical が無い`);
  }

  const nH1 = (html.match(/<h1[\s>]/g) || []).length;
  if (rel === '/index.html') {
    if (nH1 !== 1) fail(`${rel}: <h1> が ${nH1} 個（1個であるべき）`);
  } else if (nH1 !== 1) fail(`${rel}: <h1> が ${nH1} 個`);

  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { fail(`${rel}: JSON-LD が不正 — ${e.message}`); }
  }

  // 画像のalt漏れ（装飾は alt="" 必須）
  for (const m of html.matchAll(/<img\s[^>]*>/g)) {
    if (!/\balt=/.test(m[0])) fail(`${rel}: alt の無い <img>: ${m[0].slice(0, 70)}`);
  }

  // リンク切れ
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const r = resolves(m[1]);
    if (r === false) fail(`${rel}: リンク切れ → ${m[1]}`);
    if (r === null) warn(`${rel}: 相対パス（絶対パス推奨） → ${m[1]}`);
  }
}

/* ---- 3: sitemap ---- */
{
  const sm = fs.readFileSync(path.join(PUB, 'sitemap.xml'), 'utf8');
  const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
  const origin = site.origin.replace(/\/$/, '');
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (!locs.length) fail('sitemap.xml が空');
  const inSitemap = new Set();
  for (const l of locs) {
    if (!l.startsWith(origin)) { fail(`sitemap: originが違う → ${l}`); continue; }
    const p = l.slice(origin.length) || '/';
    inSitemap.add(p);
    if (resolves(p) !== true) fail(`sitemap: 実在しないURL → ${l}`);
  }
  // 逆方向: 生成したページが sitemap に載っているか
  for (const f of htmls) {
    const rel = relOf(f);
    if (rel === '/404.html') continue;
    const p = rel.replace(/index\.html$/, '');
    if (!inSitemap.has(p)) fail(`sitemap に載っていないページ → ${p}`);
  }
}

/* ---- 5: 地図データと静的HTMLの整合 ---- */
{
  const shops = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'shops.json'), 'utf8'));
  const dataJs = fs.readFileSync(path.join(PUB, 'data.js'), 'utf8');
  const json = JSON.parse(dataJs.slice(dataJs.indexOf('{'), dataJs.lastIndexOf('}') + 1));
  if (json.shops.length !== shops.length) fail(`data.js の店数(${json.shops.length}) が data/shops.json(${shops.length}) と違う`);

  const index = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
  // 素のHTMLに全店の名前が出ているか（Googleがレンダリングしなくても中身が読める状態か）
  const missing = shops.filter((s) => !index.includes(s.name.replace(/&/g, '&amp;')));
  if (missing.length) fail(`トップの素のHTMLに出ていない店が ${missing.length} 件: ${missing.slice(0, 5).map((s) => s.name).join('、')}`);

  // 本文の件数表記が実際の件数と一致しているか（手書き数字の混入検出）
  const m = index.match(/にんにく料理の名店 (\d+)軒/);
  if (m && Number(m[1]) !== shops.length) fail(`トップ見出しの件数(${m[1]})が実データ(${shops.length})と不一致`);

  // 素のHTML本文量（JSに依存せず読める中身があるか）
  const textLen = index.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
  if (textLen < 1500) fail(`トップの素のHTML本文が ${textLen} 字しかない（JS抜きで読める中身が足りない）`);
  else console.log(`  素のHTML本文: ${textLen} 字`);
}

/* ---- 6: robots ---- */
{
  const robots = fs.readFileSync(path.join(PUB, 'robots.txt'), 'utf8');
  for (const asset of ['/data.js', '/core.js', '/app.js', '/styles.css', '/assets/']) {
    const re = new RegExp('^\\s*Disallow:\\s*' + asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'mi');
    if (re.test(robots)) fail(`robots.txt が ${asset} を塞いでいる（レンダリング時のサブリソース取得も止まる）`);
  }
  if (!/Sitemap:/i.test(robots)) fail('robots.txt に Sitemap: が無い');
  for (const asset of ['/affiliate.js', '/affiliate-config.js', '/linkswitch.js']) {
    const re = new RegExp('^\\s*Disallow:\\s*' + asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'mi');
    if (re.test(robots)) fail(`robots.txt が ${asset} を塞いでいる`);
  }
}

/* ---- 7: 広告表示（景表法5条3号・ステマ規制）----
   ①全ページに開示が出ているか ②収益化の状態と文面が一致しているか
   ③装飾されたリンクに rel="sponsored" が付いているか ④設定に秘密が混ざっていないか */
{
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  await import(pathToFileURL(path.join(PUB, 'affiliate-config.js')).href);
  await import(pathToFileURL(path.join(PUB, 'affiliate.js')).href);
  const AFF = globalThis.NM_AFF;
  const cfg = AFF.loadConfig();
  const monetized = AFF.hasAnyAffiliate(cfg);
  /* LinkSwitch（VC のタグ方式）。pid があれば全ページにタグが載り、services のドメインへの
     リンクは実行時に計測リンクへ変わる＝静的HTMLの段階で sponsored と「広告」が要る。 */
  const lsPid = AFF.linkSwitchPid(cfg);
  const lsServices = AFF.linkSwitchServices(cfg);
  if (cfg.linkSwitch && cfg.linkSwitch.pid && !lsPid) fail(`affiliate-config.js の linkSwitch.pid が数字ではない: ${JSON.stringify(cfg.linkSwitch.pid)}`);
  if (lsPid) {
    const ls = fs.existsSync(path.join(PUB, 'linkswitch.js')) ? fs.readFileSync(path.join(PUB, 'linkswitch.js'), 'utf8') : '';
    if (!ls.includes(`var vc_pid = "${lsPid}";`)) fail(`/linkswitch.js の vc_pid が設定（${lsPid}）と一致しない`);
    const priv = fs.readFileSync(path.join(PUB, 'privacy', 'index.html'), 'utf8');
    if (!/バリューコマース/.test(priv)) fail('LinkSwitch を載せているのにプライバシーポリシーに外部送信（バリューコマース）の記載が無い');
  } else if (fs.existsSync(path.join(PUB, 'linkswitch.js'))) {
    fail('LinkSwitch 未設定なのに /linkswitch.js が残っている');
  }

  for (const f of htmls) {
    const rel = relOf(f);
    const html = fs.readFileSync(f, 'utf8');
    if (!/id="ad-disclosure"/.test(html)) fail(`${rel}: 広告表示（#ad-disclosure）が無い`);
    const hasTag = html.includes(`src="${AFF.linkSwitchSrc}"`) && html.includes('src="/linkswitch.js"');
    if (lsPid && !hasTag) fail(`${rel}: LinkSwitch のタグが載っていない`);
    if (!lsPid && html.includes('valuecommerce.com/vcdal.js')) fail(`${rel}: LinkSwitch 未設定なのに vcdal.js を読み込んでいる`);
    if (/<script>\s*var vc_pid/.test(html)) fail(`${rel}: vc_pid をインラインscriptで書いている（CSP script-src 'self' で止まる）`);
    /* 文面と実態がずれると、それ自体が優良誤認になりうるので機械で縛る */
    const claimsAds = /広告（アフィリエイトリンク）が含まれます/.test(html);
    if (monetized && !claimsAds) fail(`${rel}: 収益化オンなのに「広告が含まれます」の開示が無い`);
    if (!monetized && claimsAds) fail(`${rel}: 収益化オフなのに「広告が含まれます」と書いている（事実と違う）`);

    /* アフィリエイト事業者のドメインへ出すリンクには必ず sponsored を付ける */
    for (const m of html.matchAll(/<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>/gi)) {
      const host = (() => { try { return new URL(m[1]).hostname; } catch { return ''; } })();
      const isAffHost = /(^|\.)(hb\.afl\.rakuten\.co\.jp|ck\.jp\.ap\.valuecommerce\.com|dalr\.valuecommerce\.com)$/.test(host);
      const sponsored = /rel="[^"]*\bsponsored\b/.test(m[0]);
      const nodal = /\bdata-nodal\b/.test(m[0]);
      if (isAffHost && !sponsored) {
        fail(`${rel}: アフィリンクに rel="sponsored" が無い → ${m[1].slice(0, 60)}`);
      }
      /* LinkSwitch: 提携中と宣言したサービスのドメインへのリンクは、
         ①変換対象（data-nodal 無し）なら sponsored＋「広告」が要る ②出典（data-nodal）なら sponsored を付けてはいけない */
      const svc = AFF.serviceOf(m[1]);
      if (lsPid && svc && lsServices.includes(svc)) {
        if (!nodal && !sponsored) fail(`${rel}: LinkSwitch が変換するリンクに sponsored が無い → ${m[1].slice(0, 60)}`);
        if (!nodal && !/<\/a><span class="nm-ad-mark">広告<\/span>/.test(html.slice(m.index, m.index + 600))) fail(`${rel}: LinkSwitch が変換するリンクに「広告」表示が無い → ${m[1].slice(0, 60)}`);
        if (nodal && sponsored) fail(`${rel}: 出典リンク（data-nodal）に sponsored が付いている → ${m[1].slice(0, 60)}`);
      }
      if (nodal && !svc && /rel="[^"]*\bsponsored\b/.test(m[0])) fail(`${rel}: data-nodal と sponsored が同居 → ${m[1].slice(0, 60)}`);
    }
  }

  /* 公開される設定ファイルに秘密が混ざっていないか（ブラウザに配信されるので致命的） */
  const cfgSrc = fs.readFileSync(path.join(PUB, 'affiliate-config.js'), 'utf8');
  for (const pat of [/secret/i, /api[_-]?key/i, /password/i, /BEGIN [A-Z ]*PRIVATE KEY/, /\bsk-[A-Za-z0-9]{16}/]) {
    if (pat.test(cfgSrc)) fail(`affiliate-config.js に秘密らしき文字列がある（${pat}）— このファイルはブラウザに配信される`);
  }
  console.log(`  広告: ${monetized ? '収益化オン' : '収益化オフ（全リンク素通し）'}${lsPid ? `／LinkSwitch pid=${lsPid} services=[${lsServices.join(',')}]` : ''}`);
}

/* ---- 結果 ---- */
console.log(`検査対象: HTML ${htmls.length} ページ / ファイル ${files.length} 件`);
if (warns.length) console.log('\n警告:\n' + warns.map((w) => '  ! ' + w).join('\n'));
if (errs.length) {
  console.error('\n不合格:\n' + errs.map((e) => '  × ' + e).join('\n'));
  process.exit(1);
}
console.log('\nすべて合格');
