/* にんにくマップ — 静的サイトビルド（依存ゼロ）
   data/shops.json + data/regions.json から
     public/data.js            … アプリが読む店舗データ
     public/index.html         … 地図＋「素のHTMLで読める全店リスト」
     public/area/<region>/     … 地域ページ
     public/genre/<genre>/     … ジャンルページ
     public/shop/<slug>/       … 店ページ
     public/list/              … 全店一覧
     public/about/ /contact/ /privacy/
     public/sitemap.xml, robots.txt
   を生成する。

   ⚠️ import.meta.url は使わない（過去にバンドル実行で1階層ズレた事故があるため）。
      パスは process.cwd() 固定で、実在検証してから書く。
   ⚠️ 本文中の件数は必ず機械集計する。手で数字を書かない。
*/
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const PUB = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');

if (!fs.existsSync(path.join(PUB, 'app.js'))) {
  console.error(`public/app.js が見つからない。cwd=${ROOT} がプロジェクト直下か確認すること。`);
  process.exit(1);
}

/* アフィリエイト装飾層を「ブラウザと同じ1本のファイル」から読む。
   public/affiliate.js は import/export を持たないIIFEなので、ESMとしてそのまま実行でき、
   globalThis.NM_AFF に生える。＝静的ページ（ここ）とアプリ（app.js）で実装が絶対に食い違わない。

   affiliate-config.js は素直に `window.NM_AFFILIATE = {...}` と書けるようにしておきたい
   （代表が編集するファイルなので、環境判定の呪文を混ぜたくない）。Node には window が無いので
   ここで受け皿を作る。globalThis を指すので、affiliate.js 側の環境判定も同じ器を見る。 */
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
for (const f of ['affiliate-config.js', 'affiliate.js']) {
  const p = path.join(PUB, f);
  if (!fs.existsSync(p)) { console.error(`public/${f} が見つからない。`); process.exit(1); }
  await import(pathToFileURL(p).href);
}
const AFF = globalThis.NM_AFF;
const AFF_CFG = AFF.loadConfig();
const MONETIZED = AFF.hasAnyAffiliate(AFF_CFG);

/* バリューコマース LinkSwitch（2026-09-24）。pid があれば全ページにタグを載せる。
   ⚠️ CSP が script-src 'self' なので `<script>var vc_pid=…</script>` のインライン記述は使えない
      （ハッシュを CSP に書く手もあるが、値がずれた瞬間に黙って止まる）。
      同一オリジンの /linkswitch.js を生成してそこに vc_pid を書き、その後ろで vcdal.js を async 読込する。
   ⚠️ config に pid らしきものがあるのに数字でない＝書き間違い。黙ってオフにせずビルドを止める。 */
const LS_PID = AFF.linkSwitchPid(AFF_CFG);
if (AFF_CFG.linkSwitch && AFF_CFG.linkSwitch.pid && !LS_PID) {
  console.error(`affiliate-config.js の linkSwitch.pid が数字ではない: ${JSON.stringify(AFF_CFG.linkSwitch.pid)}`);
  process.exit(1);
}
/* バリューコマースを何か1つでも使っているか（MyLink／画像バナー／LinkSwitch）。
   プライバシーポリシーの外部送信の記載と、CSP の画像の許可をこれで出し分ける。 */
const VC_MYLINK = Object.keys(AFF_CFG.valueCommerce || {}).filter((k) => AFF.impressionPixel(k, AFF_CFG));
const VC_BANNER = AFF.hasAnyBanner(AFF_CFG);
const VC_ANY = !!LS_PID || VC_MYLINK.length > 0 || VC_BANNER;
const LS_TAG = LS_PID
  ? `<script src="/linkswitch.js"></script><script src="${AFF.linkSwitchSrc}" async></script>`
  : '';

const SITE = JSON.parse(fs.readFileSync(path.join(DATA, 'site.json'), 'utf8'));
const ORIGIN = SITE.origin.replace(/\/$/, '');
const shops = JSON.parse(fs.readFileSync(path.join(DATA, 'shops.json'), 'utf8'));
const regions = JSON.parse(fs.readFileSync(path.join(DATA, 'regions.json'), 'utf8'));

const GENRES = [
  { id: 'steak', label: 'ステーキ・肉', desc: 'にんにくをきかせたステーキ・焼肉・肉料理の店' },
  { id: 'ramen', label: 'ラーメン', desc: 'にんにくが主役のラーメン・つけ麺の店' },
  { id: 'bar', label: 'バル・イタリアン', desc: 'アヒージョやガーリックトーストで攻めるバル・イタリアン' },
  { id: 'izakaya', label: '居酒屋', desc: 'にんにく料理をつまみに飲める居酒屋・大衆酒場' },
  { id: 'chuka', label: '中華・アジア', desc: 'にんにくを効かせた中華・アジア料理の店' },
  { id: 'shop', label: 'カフェ・物販', desc: 'にんにくそのものを買える店やカフェ' },
];
const LEVELS = {
  3: { label: 'にんにく100%', desc: 'メニューのほぼ全部がにんにく料理。にんにくを食べに行く店。' },
  2: { label: 'にんにく推し', desc: '専門店ではないけれど、にんにく料理が主役級で選べる店。' },
  1: { label: '名物あり', desc: 'ふつうの店だが、名物のにんにく料理が知られている。' },
};

/* FAQ の答えは、必ずデータから機械的に組み立てるか、検証済みの事実だけを書く */
const FAQ = [
  {
    q: 'にんにく専門店とは、どういう店ですか？',
    a: 'このサイトでは「メニューのほぼ全部がにんにく料理で、にんにくを食べに行くために入る店」を専門店（にんにく100%）としています。前菜からデザートまでにんにくを使う店や、店名・看板がにんにくを掲げている店が該当します。にんにく料理が1〜2品あるだけの店は掲載していません。',
  },
  {
    q: '掲載している情報はどこから取っていますか？',
    a: '店舗の公式サイト・公式SNS、大手グルメサイト、自治体や観光協会の公開情報です。各店のページ末尾に、確認に使った情報源を載せています。閉店・移転が確認できた店は掲載していません。',
  },
  {
    q: '独自の点数やランキングはありますか？',
    a: 'ありません。他サイトの評価点も転載していません。掲載しているのは「にんにくがどれくらい主役か」という3段階の分類だけです。',
  },
  {
    q: '営業時間は必ず正しいですか？',
    a: '掲載時点で確認できた内容ですが、営業時間や定休日は変わります。訪問前に必ず店舗の最新情報をご確認ください。誤りを見つけた場合はお問い合わせからお知らせいただけると助かります。',
  },
  {
    q: 'お店の掲載や、掲載の取り下げをお願いできますか？',
    a: 'どちらも受け付けています。<a href="/contact/">お問い合わせ</a>からご連絡ください。掲載依頼は内容を確認のうえ、裏取りができたものを掲載します。店舗関係者からの取り下げ依頼は確認のうえ速やかに対応します。',
  },
];

/* ---------------- ユーティリティ ---------------- */
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const byRegion = (id) => shops.filter((s) => s.region === id);
const byGenre = (id) => shops.filter((s) => s.genre === id);
const regionOf = (id) => regions.find((r) => r.id === id);
const genreOf = (id) => GENRES.find((g) => g.id === id);

function write(rel, content) {
  const full = path.join(PUB, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return rel;
}

/* ---------------- 検証（壊れたまま出さない） ---------------- */
{
  const errs = [];
  const slugs = new Set();
  for (const s of shops) {
    if (!s.id) errs.push(`id が無い: ${s.name}`);
    if (!s.slug) errs.push(`slug が無い: ${s.name}`);
    if (s.slug && !/^[a-z0-9-]+$/.test(s.slug)) errs.push(`slug がURL安全でない: ${s.name} → ${s.slug}`);
    if (s.slug && slugs.has(s.slug)) errs.push(`slug が重複: ${s.slug}`);
    slugs.add(s.slug);
    if (typeof s.lat !== 'number' || typeof s.lon !== 'number') errs.push(`座標が無い: ${s.name}`);
    if (s.lat < 20 || s.lat > 46 || s.lon < 122 || s.lon > 154) errs.push(`座標が日本の範囲外: ${s.name} (${s.lat},${s.lon})`);
    if (!regionOf(s.region)) errs.push(`地域IDが不正: ${s.name} → ${s.region}`);
    if (!genreOf(s.genre)) errs.push(`ジャンルIDが不正: ${s.name} → ${s.genre}`);
    if (![1, 2, 3].includes(s.level)) errs.push(`にんにく度が不正: ${s.name} → ${s.level}`);
    if (!s.sources || !s.sources.length) errs.push(`出典が無い: ${s.name}`);
    // 都道府県名が area の先頭に入っているか（地域ページの見出しで使う）
    if (!s.area || !/[都道府県]/.test(s.area)) errs.push(`area が都道府県から始まっていない: ${s.name} → ${s.area}`);
  }
  if (errs.length) {
    console.error('データ検証で不合格:\n' + errs.map((e) => '  × ' + e).join('\n'));
    process.exit(1);
  }
}

/* ---------------- 共通レイアウト ---------------- */
/* 広告表示（景表法5条3号・ステマ規制 2023-10-01施行）。
   「広告なのに広告と分からない」状態を作らないための開示。全ページのフッターに常時出す。
   ⚠️ 収益化オン/オフで文面を変える。オフのときに「広告が含まれます」と書くのは事実に反するし、
      オンのときに黙っているのは規制に触れる。affiliate-config.js の中身だけで自動的に切り替わる。
   ⚠️ 2文目（編集方針）は事実に基づく: 掲載店は一次情報での裏取りで選んでおり、
      落とした店は data/excluded.json に理由ごと残している。店舗から金銭を受け取っての掲載はしていない。 */
const AD_DISCLOSURE = MONETIZED
  ? `<div id="ad-disclosure" class="nm-ad-disclosure"><strong>広告について</strong>：当サイトには広告（アフィリエイトリンク）が含まれます。リンク経由でのご予約・ご購入により、当サイトが報酬を受け取ることがあります。<strong>掲載するお店の選定・記載内容は、報酬の有無や店舗からの依頼と無関係に決めています。</strong></div>`
  : `<div id="ad-disclosure" class="nm-ad-disclosure"><strong>広告について</strong>：現在、当サイトに広告は掲載していません。<strong>掲載するお店の選定・記載内容は、報酬の有無や店舗からの依頼と無関係に決めています。</strong></div>`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700;900&family=M+PLUS+Rounded+1c:wght@400;500;800&family=Roboto+Mono:wght@400&display=swap" rel="stylesheet">`;

function layout({ title, desc, canonical, body, jsonld = [], appShell = false, crumbs = null, is404 = false }) {
  const url = ORIGIN + canonical;
  const ld = jsonld.length
    ? jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('')
    : '';
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(ORIGIN)}/assets/og.png">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#efe2cd">
${FONTS}
<link rel="stylesheet" href="/styles.css">
${ld}
</head>
<body>
${crumbs ? `<nav class="nm-crumbs" aria-label="パンくず">${crumbs}</nav>` : ''}
${body}
<footer class="nm-foot">
  <nav>
    <a href="/">地図トップ</a>
    <a href="/list/">全店一覧</a>
    <a href="/about/">このサイトについて</a>
    <a href="/contact/">お店の情報提供・掲載依頼</a>
    <a href="/privacy/">プライバシーポリシー</a>
  </nav>
  <div>${esc(SITE.name)}｜掲載情報は各店舗の公式サイト・大手グルメサイト等の公開情報をもとにしています。訪問前に必ず店舗の最新情報をご確認ください。</div>
  <div>地図の形状データ: Natural Earth（パブリックドメイン）／住所の座標: 国土地理院 地理院地図Vector提供の住所検索API</div>
  ${AD_DISCLOSURE}
</footer>
${appShell ? '<script src="/affiliate-config.js"></script><script src="/affiliate.js"></script><script src="/data.js"></script><script src="/core.js"></script><script src="/app.js" defer></script>' : ''}
${LS_TAG ? `<!-- バリューコマース LinkSwitch（提携中の広告主へのリンクを計測リンクに置き換える）。設定=/affiliate-config.js -->\n${LS_TAG}` : ''}
<!-- アクセス解析（自社・cookieless）。正本=~/dev/quirio-analytics、配布は npm run sync -->
<script defer src="/qa.js"${is404 ? ' data-qa-404' : ''}></script>
</body>
</html>
`;
}

function crumbTrail(items) {
  return items.map((i, n) => (n === items.length - 1
    ? `<span aria-current="page">${esc(i.name)}</span>`
    : `<a href="${esc(i.url)}">${esc(i.name)}</a>`)).join(' › ');
}
function crumbLd(items) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((i, n) => ({ '@type': 'ListItem', position: n + 1, name: i.name, item: ORIGIN + i.url })),
  };
}

/* ---------------- 店カード（静的HTML） ---------------- */
function shopCard(s, { showRegion = false } = {}) {
  const r = regionOf(s.region);
  const g = genreOf(s.genre);
  return `<article class="nm-card">
  <h3><span class="nm-badge lv${s.level}">${esc(LEVELS[s.level].label)}</span><a href="/shop/${esc(s.slug)}/">${esc(s.name)}</a></h3>
  <div class="nm-area">${esc(s.area)}${showRegion ? `（${esc(r.name)}）` : ''}・${esc(g.label)}</div>
  <p class="nm-menu">${esc(s.menu)}${s.price ? `／${esc(s.price)}` : ''}</p>
  <dl>
    <dt>住所</dt><dd>${esc(s.addr)}</dd>
    <dt>営業時間</dt><dd>${esc(s.hours || '要確認')}${s.closed_days ? `（休み：${esc(s.closed_days)}）` : ''}</dd>
  </dl>
</article>`;
}

function cardGrid(list, opts) {
  return `<div class="nm-cards">${list.map((s) => shopCard(s, opts)).join('\n')}</div>`;
}

/* ---------------- 1. トップ ---------------- */
{
  const total = shops.length;
  const lv3 = shops.filter((s) => s.level === 3).length;
  const prefs = new Set(shops.map((s) => s.area.split(/[ 　]/)[0]));
  const activeRegions = regions.filter((r) => byRegion(r.id).length > 0);

  const regionLines = regions.map((r) => {
    const n = byRegion(r.id).length;
    return `<li><a href="/area/${r.id}/">${esc(r.name)}のにんにく店</a>：${n} 軒${n === 0 ? '（調査中）' : ''}</li>`;
  }).join('');

  const staticList = activeRegions.map((r) => {
    const list = byRegion(r.id);
    return `<section id="area-${r.id}">
  <h2><img src="/assets/garlic-sm.svg" alt="" width="24" height="25">${esc(r.name)}のにんにく専門店・名店（${list.length}軒）</h2>
  <p>${esc(r.blurb)}。${esc(r.name)}で確認できたお店を一覧にしました。<a href="/area/${r.id}/">${esc(r.name)}のページ</a>にもまとめています。</p>
  ${cardGrid(list)}
</section>`;
  }).join('\n');

  const body = `
<div id="nm-app"></div>

<main class="nm-doc">
  <section class="nm-panel">
    <h1>にんにくマップ｜全国のにんにく専門店・にんにく料理の名店 ${total}軒</h1>
    <p class="nm-lede">
      「今日はにんにくを浴びたい」という日に開くための地図です。日本全国から、<strong>メニューのほとんどがにんにく料理という専門店</strong>や、
      <strong>にんにく料理が名物として知られている店</strong>だけを集めて ${total} 軒を掲載しています（${prefs.size} 都道府県／うちにんにく専門店は ${lv3} 軒）。
      掲載の可否は、店舗の公式サイト・公式SNS・大手グルメサイト・自治体や観光協会の情報を一件ずつ確認したうえで判断しています。
    </p>
    <p>
      上の地図は、地域をタップ → お店のピンをタップの順で使います。ジャンルや「にんにく度」でも絞り込めます。
      地図が使えない環境の方は、下の一覧からどうぞ。
    </p>
    <div class="nm-tags">
      ${GENRES.filter((g) => byGenre(g.id).length).map((g) => `<a href="/genre/${g.id}/">${esc(g.label)}（${byGenre(g.id).length}）</a>`).join('')}
    </div>
  </section>

  <section class="nm-panel">
    <h2><img src="/assets/garlic-sm.svg" alt="" width="24" height="25">「にんにく度」の見かた</h2>
    <ul>
      ${[3, 2, 1].map((n) => `<li><span class="nm-badge lv${n}">${esc(LEVELS[n].label)}</span>${esc(LEVELS[n].desc)}（${shops.filter((s) => s.level === n).length}軒）</li>`).join('')}
    </ul>
    <p class="nm-note">
      「たまたまガーリックトーストがある」程度の店は掲載していません。にんにくが看板になっている店だけを載せる方針です。
    </p>
  </section>

  <section class="nm-panel">
    <h2><img src="/assets/garlic-sm.svg" alt="" width="24" height="25">地域からさがす</h2>
    <ul>${regionLines}</ul>
  </section>

  ${staticList}

  <section class="nm-panel">
    <h2><img src="/assets/garlic-sm.svg" alt="" width="24" height="25">よくある質問</h2>
    ${FAQ.map((f) => `<h3>${esc(f.q)}</h3><p>${f.a}</p>`).join('')}
  </section>
</main>`;

  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: ORIGIN + '/', inLanguage: 'ja' },
    {
      '@context': 'https://schema.org', '@type': 'ItemList',
      name: '全国のにんにく専門店・にんにく料理の名店',
      numberOfItems: shops.length,
      itemListElement: shops.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/shop/${s.slug}/`, name: s.name })),
    },
    {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/<[^>]+>/g, '') } })),
    },
  ];

  write('index.html', layout({
    title: `にんにくマップ｜全国のにんにく専門店・にんにく料理の名店${total}軒`,
    desc: `全国のにんにく専門店とにんにく料理の名店を${total}軒、地図から探せます。${prefs.size}都道府県／にんにく100%の専門店${lv3}軒。営業時間・住所・看板メニューつき。`,
    canonical: '/', body, jsonld: ld, appShell: true,
  }));
}

/* ---------------- 2. 地域ページ ---------------- */
for (const r of regions) {
  const list = byRegion(r.id);
  const crumbs = [{ name: 'にんにくマップ', url: '/' }, { name: `${r.name}のにんにく店`, url: `/area/${r.id}/` }];
  const prefs = [...new Set(list.map((s) => s.area.split(/[ 　]/)[0]))];

  const body = `<main class="nm-doc">
  <section class="nm-panel">
    <h1>${esc(r.name)}のにんにく専門店・にんにく料理の名店（${list.length}軒）</h1>
    ${list.length ? `<p class="nm-lede">${esc(r.blurb)}。${esc(r.name)}（${esc(prefs.join('・'))}）で確認できた、にんにくが看板のお店 ${list.length} 軒です。地図から探したいときは<a href="/#/area/${r.id}">トップの地図</a>をどうぞ。</p>
    ${cardGrid(list)}`
      : `<p class="nm-lede">${esc(r.name)}は現在まだ掲載店がありません。にんにくが看板の店をご存じでしたら、<a href="/contact/">情報提供フォーム</a>から教えてください。裏取りのうえ掲載します。</p>`}
  </section>
  <section class="nm-panel">
    <h2><img src="/assets/garlic-sm.svg" alt="" width="24" height="25">ほかの地域</h2>
    <div class="nm-tags">${regions.filter((x) => x.id !== r.id).map((x) => `<a href="/area/${x.id}/">${esc(x.name)}（${byRegion(x.id).length}）</a>`).join('')}</div>
  </section>
</main>`;

  const ld = [crumbLd(crumbs)];
  if (list.length) {
    ld.push({
      '@context': 'https://schema.org', '@type': 'ItemList',
      name: `${r.name}のにんにく専門店・名店`, numberOfItems: list.length,
      itemListElement: list.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/shop/${s.slug}/`, name: s.name })),
    });
  }

  write(`area/${r.id}/index.html`, layout({
    title: `${r.name}のにんにく専門店・にんにく料理の名店${list.length}軒｜にんにくマップ`,
    desc: list.length
      ? `${r.name}（${prefs.join('・')}）のにんにく専門店・にんにく料理の名店を${list.length}軒まとめました。住所・営業時間・看板メニューつき。`
      : `${r.name}のにんにく専門店を調査中です。ご存じのお店があれば情報提供をお願いします。`,
    canonical: `/area/${r.id}/`, body, jsonld: ld,
    crumbs: crumbTrail(crumbs),
  }));
}

/* ---------------- 3. ジャンルページ ---------------- */
for (const g of GENRES) {
  const list = byGenre(g.id);
  if (!list.length) continue;
  const crumbs = [{ name: 'にんにくマップ', url: '/' }, { name: g.label, url: `/genre/${g.id}/` }];
  const body = `<main class="nm-doc">
  <section class="nm-panel">
    <h1>にんにくが名物の${esc(g.label)}（${list.length}軒）</h1>
    <p class="nm-lede">${esc(g.desc)}を全国から${list.length}軒。</p>
    ${cardGrid(list, { showRegion: true })}
  </section>
  <section class="nm-panel">
    <h2><img src="/assets/garlic-sm.svg" alt="" width="24" height="25">ほかのジャンル</h2>
    <div class="nm-tags">${GENRES.filter((x) => x.id !== g.id && byGenre(x.id).length).map((x) => `<a href="/genre/${x.id}/">${esc(x.label)}（${byGenre(x.id).length}）</a>`).join('')}</div>
  </section>
</main>`;
  write(`genre/${g.id}/index.html`, layout({
    title: `にんにくが名物の${g.label}${list.length}軒｜にんにくマップ`,
    desc: `${g.desc}を全国から${list.length}軒まとめました。住所・営業時間・看板メニューつき。`,
    canonical: `/genre/${g.id}/`, body,
    jsonld: [crumbLd(crumbs), {
      '@context': 'https://schema.org', '@type': 'ItemList', name: `にんにくが名物の${g.label}`, numberOfItems: list.length,
      itemListElement: list.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/shop/${s.slug}/`, name: s.name })),
    }],
    crumbs: crumbTrail(crumbs),
  }));
}

/* ---------------- 4. 店ページ ---------------- */
for (const s of shops) {
  const r = regionOf(s.region), g = genreOf(s.genre);
  const crumbs = [
    { name: 'にんにくマップ', url: '/' },
    { name: `${r.name}のにんにく店`, url: `/area/${r.id}/` },
    { name: s.name, url: `/shop/${s.slug}/` },
  ];
  const near = byRegion(s.region).filter((x) => x.id !== s.id).slice(0, 6);
  const mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${s.name} ${s.addr}`);

  const rows = [
    ['住所', esc(s.addr)],
    ['営業時間', esc(s.hours || '要確認')],
    ['定休日', esc(s.closed_days || '要確認')],
    s.tel ? ['電話', esc(s.tel)] : null,
    ['ジャンル', `<a href="/genre/${g.id}/">${esc(g.label)}</a>`],
    ['にんにく度', `<span class="nm-badge lv${s.level}">${esc(LEVELS[s.level].label)}</span>${esc(LEVELS[s.level].desc)}`],
    ['看板メニュー', esc(s.menu) + (s.price ? `（${esc(s.price)}）` : '')],
    /* 公式サイト欄にホットペッパー等のページが入っている店がある（ch11）。URL からサービスを引き、
       提携中なら食べログと同じく広告表示と sponsored を付ける。該当なしは 'official'＝素通し。 */
    s.official_url ? ['公式サイト', extLink(AFF.serviceOf(s.official_url) || 'official', s.official_url, s.official_url)] : null,
    /* 食べログは掲載45軒中23軒にあり、写真・営業時間の確認先として実用性が高い。
       同時に本サイト唯一のまとまった送客面でもあるので decorate() を通す。
       ⚠️ 提携前（config が空）は装飾されず rel も sponsored にならない＝素の外部リンクとして出る。 */
    s.tabelog_url ? ['食べログ', extLink('tabelog', s.tabelog_url, '写真・口コミを見る')] : null,
  ].filter(Boolean);

  const body = `<main class="nm-doc">
  <section class="nm-panel">
    <h1>${esc(s.name)}｜${esc(s.area)}のにんにく${esc(g.label)}</h1>
    <p class="nm-lede">${esc(s.review)}</p>
    <table class="nm-table">
      ${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}
    </table>
    <div class="nm-tags" style="margin-top:16px">
      <a href="${esc(mapUrl)}" target="_blank" rel="noopener">地図アプリでひらく</a>
      <a href="/#/shop/${esc(s.id)}">にんにくマップで見る</a>
    </div>
    <p class="nm-note" style="margin-top:14px">
      出典：${s.sources.map((u) => `<a href="${esc(u)}" rel="nofollow noopener" target="_blank" data-nodal="">${esc(hostOf(u))}</a>`).join('、')}<br>
      営業時間・定休日は変更されることがあります。訪問前に店舗の最新情報をご確認ください。誤りを見つけたら<a href="/contact/">こちら</a>からお知らせください。
    </p>
  </section>
  ${near.length ? `<section class="nm-panel">
    <h2><img src="/assets/garlic-sm.svg" alt="" width="24" height="25">${esc(r.name)}のほかのにんにく店</h2>
    ${cardGrid(near)}
    <div class="nm-tags"><a href="/area/${r.id}/">${esc(r.name)}のにんにく店をぜんぶ見る（${byRegion(r.id).length}軒）</a></div>
  </section>` : ''}
</main>`;

  const restaurant = {
    '@context': 'https://schema.org', '@type': 'Restaurant',
    name: s.name,
    address: { '@type': 'PostalAddress', addressCountry: 'JP', streetAddress: s.addr },
    geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lon },
    servesCuisine: g.label,
    url: `${ORIGIN}/shop/${s.slug}/`,
  };
  if (s.tel) restaurant.telephone = s.tel;
  if (s.official_url) restaurant.sameAs = [s.official_url];

  write(`shop/${s.slug}/index.html`, layout({
    title: `${s.name}（${s.area}）｜にんにくマップ`,
    desc: `${s.name}（${s.area}）のにんにく情報。看板メニューは${s.menu}。住所・営業時間・定休日つきで紹介しています。`,
    canonical: `/shop/${s.slug}/`, body,
    jsonld: [crumbLd(crumbs), restaurant],
    crumbs: crumbTrail(crumbs),
  }));
}

/* ---------------- 5. 全店一覧 ---------------- */
{
  const crumbs = [{ name: 'にんにくマップ', url: '/' }, { name: '全店一覧', url: '/list/' }];
  const body = `<main class="nm-doc">
  <section class="nm-panel">
    <h1>にんにくマップ 掲載店 全${shops.length}軒の一覧</h1>
    <p class="nm-lede">地域別に並べた全掲載店の一覧です。</p>
  </section>
  ${regions.filter((r) => byRegion(r.id).length).map((r) => `<section class="nm-panel">
    <h2><img src="/assets/garlic-sm.svg" alt="" width="24" height="25"><a href="/area/${r.id}/">${esc(r.name)}</a>（${byRegion(r.id).length}軒）</h2>
    ${cardGrid(byRegion(r.id))}
  </section>`).join('')}
</main>`;
  write('list/index.html', layout({
    title: `掲載店 全${shops.length}軒の一覧｜にんにくマップ`,
    desc: `にんにくマップに掲載している全${shops.length}軒を地域別に一覧できます。`,
    canonical: '/list/', body, jsonld: [crumbLd(crumbs)], crumbs: crumbTrail(crumbs),
  }));
}

/* ---------------- 6. 固定ページ ---------------- */
{
  const pages = [
    {
      slug: 'about', title: 'このサイトについて', desc: 'にんにくマップの掲載基準・情報源・更新方針について。',
      body: `<h1>このサイトについて</h1>
<p>「にんにくマップ」は、にんにく好きが今日行く店を決めるための地図です。運営は個人です。</p>
<h2>掲載の基準</h2>
<p>にんにくが店の看板になっているかどうかで判断しています。具体的には次の3段階です。</p>
<ul>
${[3, 2, 1].map((n) => `<li><strong>${esc(LEVELS[n].label)}</strong>：${esc(LEVELS[n].desc)}</li>`).join('')}
</ul>
<p>「メニューの中にガーリックトーストが1品ある」といった店は掲載していません。</p>
<h2>情報の裏取り</h2>
<p>掲載にあたっては、店舗の公式サイト・公式SNS、大手グルメサイト、自治体や観光協会の情報を一件ずつ確認しています。閉店・移転が確認できた店は掲載しません。各店ページの末尾に、確認に使った情報源を記載しています。</p>
<p>それでも、営業時間や定休日は変わります。<strong>訪問前に必ず店舗の最新情報をご確認ください。</strong>掲載内容の誤りにお気づきの場合は<a href="/contact/">お問い合わせ</a>からご連絡ください。</p>
<h2>評価点について</h2>
<p>当サイトは独自の点数やランキングをつけていません。他サイトの評価点も転載していません。掲載しているのは「にんにくが売りかどうか」という分類だけです。</p>
<h2>クレジット</h2>
<p>日本地図の形状データは Natural Earth（パブリックドメイン）を加工したものです。住所から座標への変換には国土地理院の住所検索APIを利用しています。</p>`,
    },
    {
      slug: 'contact', title: 'お店の情報提供・掲載依頼', desc: 'にんにくマップへの掲載依頼、情報の誤りのご連絡、広告掲載のお問い合わせ。',
      body: `<h1>お店の情報提供・掲載依頼</h1>
<h2>こんなお店を探しています</h2>
<p>にんにくが看板になっている店なら、規模や業態は問いません。とくに掲載が薄い地域（${regions.filter((r) => byRegion(r.id).length === 0).map((r) => r.name).join('・') || 'なし'}）の情報を探しています。</p>
<h2>ご連絡はこちら</h2>
<p>次のいずれかをお知らせください。内容を確認のうえ、裏取りができたものを掲載します。</p>
<ul>
  <li>掲載してほしいお店（店名・住所・にんにく料理の内容）</li>
  <li>掲載内容の誤り（閉店・移転・営業時間の変更など）</li>
  <li>掲載の取り下げ依頼（店舗関係者の方）</li>
  <li>広告掲載のご相談</li>
</ul>
<p><strong>メール：</strong><a href="mailto:${esc(SITE.email)}">${esc(SITE.email)}</a></p>
<p class="nm-note">お店の関係者の方からの掲載取り下げ依頼は、確認のうえ速やかに対応します。</p>`,
    },
    {
      slug: 'privacy', title: 'プライバシーポリシー', desc: 'にんにくマップにおけるアクセス解析・広告・お問い合わせ情報の取り扱い。',
      body: `<h1>プライバシーポリシー</h1>
<h2>アクセス解析</h2>
<p>どのページがどれくらい見られているかを把握するため、運営者が自ら運用するアクセス解析を利用しています。<strong>Cookieは使用しません。</strong>Google アナリティクス等の外部の解析サービスは利用していません。</p>
<ul>
<li>ブラウザから送信される情報：閲覧したページのURL（パス）、参照元のURL、キャンペーン識別子（utmパラメータ・広告クリック識別子の有無）、画面の幅、ブラウザの言語設定、ページの滞在時間、スクロールした割合</li>
<li>押した操作について送信される情報：外部サイトへのリンク（食べログ・Googleマップ・各店の公式サイトなど）やメールアドレスへのリンクを押したという事実と、<strong>遷移先のホスト名のみ</strong>（例：<code>tabelog.com</code>）。<strong>リンクのURL全体・店名・メールアドレス・表示文言は送信しません。</strong></li>
<li>サーバー側で判定する情報：接続元のおおよその国および都道府県、端末の種別（パソコン・スマートフォン・タブレット）、ブラウザとOSの種類（ブラウザが送信するUser-Agentから判定します）</li>
<li>送信先：株式会社QUIRIO（<code>quirio-analytics.wataru-okada.workers.dev</code>）。第三者への提供・広告配信事業者への送信は行いません。</li>
<li>利用者の識別：訪問を区別するための符号はサーバー側で生成し、<strong>IPアドレスは保存しません</strong>。この符号は毎日作り直されるため日をまたいだ追跡はできず、サイトごとに異なる符号となるため運営者の他サイトの利用状況と結び付けることもできません。</li>
<li>停止方法：このサイトのURLの末尾に <code>?__qa_optout=1</code> を付けて一度開くと、以後の計測を停止します。再開する場合は <code>?__qa_optout=0</code> を付けて開いてください。ブラウザの「トラッキング拒否（Global Privacy Control）」設定が有効な場合は、はじめから計測を行いません。</li>
</ul>
<h2>広告・アフィリエイトについて</h2>
<p>当サイトは広告を掲載することがあります。広告配信事業者がCookie等を用いて広告の最適化を行う場合があります。ブラウザの設定でCookieを無効にできます。</p>
<p>また、当サイトはアフィリエイトプログラムを利用することがあります。この場合、当サイトのリンクを経由してご予約・ご購入いただくと、当サイトが広告主から報酬を受け取ることがあります。報酬が発生するリンクには「広告」と表示し、リンクに <code>rel="sponsored"</code> を付与しています。</p>
<p><strong>掲載するお店の選定および記載内容は、報酬の有無や店舗からの依頼と無関係に決めています。</strong>掲載は編集上の判断のみで行っており、掲載料を受け取って店舗を掲載することはありません。掲載を見送った店舗については、その理由を記録しています。</p>
${VC_ANY ? `<h3>バリューコマース（外部送信）</h3>
<p>当サイトは、アフィリエイト・サービス・プロバイダであるバリューコマース株式会社のサービスを利用しています。</p>
<ul>
${VC_MYLINK.length || VC_BANNER ? `<li>広告リンク・広告画像：食べログ等への一部のリンクと広告画像は、同社のサーバー（<code>ck.jp.ap.valuecommerce.com</code>）を経由して遷移し、表示の際に同社のサーバー（<code>ad.jp.ap.valuecommerce.com</code>、<code>i.imgvc.com</code>）から画像を読み込みます。</li>` : ''}
${LS_PID ? `<li>LinkSwitch：各ページで同社のプログラム（<code>aml.valuecommerce.com</code>）を読み込み、提携中のサイトへのリンクを、成果を計測できるリンクに置き換えます。</li>` : ''}
<li>送信先：バリューコマース株式会社（<code>valuecommerce.com</code>、<code>imgvc.com</code>）</li>
<li>送信される情報：閲覧しているページのURL、参照元のURL、ブラウザの種類等の情報、同社が発行する識別子（Cookie）</li>
<li>利用目的：広告の表示と、リンク経由のご予約・ご購入等の成果の計測</li>
<li>報酬が発生するリンク・画像には「広告」と表示し、リンクに <code>rel="sponsored"</code> を付けています。出典として示すリンクは置き換えの対象から外しています。</li>
<li>同社での情報の取り扱いと停止方法は、<a href="https://www.valuecommerce.ne.jp/" target="_blank" rel="noopener" data-nodal="">バリューコマース株式会社のサイト</a>をご確認ください。</li>
</ul>` : ''}
<h2>外部リンク</h2>
<p>当サイトは各店舗の公式サイトやグルメサイトへのリンクを含みます。リンク先での個人情報の取り扱いについては、各サイトのポリシーをご確認ください。</p>
<h2>お問い合わせでいただいた情報</h2>
<p>お問い合わせでいただいたメールアドレス等は、返信および掲載内容の確認の目的にのみ利用し、第三者へ提供しません。</p>
<h2>免責</h2>
<p>掲載情報の正確性には努めていますが、営業時間・定休日・メニュー等は変更される場合があります。当サイトの情報により生じた損害について責任を負いかねます。訪問前に店舗の最新情報をご確認ください。</p>
<h2>改定</h2>
<p>本ポリシーは必要に応じて改定します。</p>`,
    },
  ];
  for (const p of pages) {
    const crumbs = [{ name: 'にんにくマップ', url: '/' }, { name: p.title, url: `/${p.slug}/` }];
    write(`${p.slug}/index.html`, layout({
      title: `${p.title}｜にんにくマップ`, desc: p.desc, canonical: `/${p.slug}/`,
      body: `<main class="nm-doc"><section class="nm-panel">${p.body}</section></main>`,
      jsonld: [crumbLd(crumbs)], crumbs: crumbTrail(crumbs),
    }));
  }
}

/* ---------------- 7. 404 ---------------- */
write('404.html', layout({
  title: 'ページが見つかりません｜にんにくマップ',
  desc: 'お探しのページは見つかりませんでした。',
  canonical: '/404.html',
  // ⚠️ Cloudflare Pages の 404 は URL を保ったまま返るのでパスでは判別できない。
  //    この印が無いと、存在しないURLが「見つかった」として計測され、
  //    壊れたリンクの集計が永久に0件になる（= 壊れていないように読める）。
  is404: true,
  body: `<main class="nm-doc"><section class="nm-panel">
  <h1>ページが見つかりません</h1>
  <p>お探しのページは移動したか、削除された可能性があります。</p>
  <div class="nm-tags"><a href="/">地図トップへ</a><a href="/list/">全店一覧へ</a></div>
</section></main>`,
}));

/* ---------------- 8. アプリ用データ ---------------- */
{
  const appShops = shops.map((s) => ({
    id: s.id, slug: s.slug, name: s.name, region: s.region, area: s.area, addr: s.addr,
    hours: s.hours || '要確認', closed_days: s.closed_days || '', genre: s.genre, level: s.level,
    menu: s.menu, price: s.price || '', review: s.review, lat: s.lat, lon: s.lon,
    official_url: s.official_url || '', tabelog_url: s.tabelog_url || '', sources: s.sources.slice(0, 2),
  }));
  const appRegions = regions.map((r) => ({
    id: r.id, name: r.name, kana: r.kana, lat: r.lat, lon: r.lon, zoom: r.zoom,
    blurb: byRegion(r.id).length ? r.blurb : 'ただいま調査中',
  }));
  write('data.js', `/* 生成物 — 直接編集しない。data/shops.json を直して npm run build */\nwindow.NM_DATA=${JSON.stringify({ shops: appShops, regions: appRegions })};\n`);
}

/* ---------------- 9. sitemap / robots / manifest ---------------- */
{
  const urls = [
    { u: '/', p: '1.0' },
    { u: '/list/', p: '0.8' },
    ...regions.map((r) => ({ u: `/area/${r.id}/`, p: byRegion(r.id).length ? '0.8' : '0.4' })),
    ...GENRES.filter((g) => byGenre(g.id).length).map((g) => ({ u: `/genre/${g.id}/`, p: '0.7' })),
    ...shops.map((s) => ({ u: `/shop/${s.slug}/`, p: '0.7' })),
    { u: '/about/', p: '0.4' }, { u: '/contact/', p: '0.4' }, { u: '/privacy/', p: '0.2' },
  ];
  const today = SITE.lastmod;
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((x) => `  <url><loc>${ORIGIN}${x.u}</loc><lastmod>${today}</lastmod><priority>${x.p}</priority></url>`).join('\n')}
</urlset>
`);

  // ⚠️ /data.js /core.js /app.js /styles.css を Disallow にしないこと。
  //    robots.txt はレンダリング時のサブリソース取得にも効くため、塞ぐと地図が空で評価される。
  write('robots.txt', `User-agent: *
Allow: /

Sitemap: ${ORIGIN}/sitemap.xml
`);

  write('manifest.webmanifest', JSON.stringify({
    name: SITE.name, short_name: 'にんにくマップ', start_url: '/', display: 'standalone',
    background_color: '#efe2cd', theme_color: '#efe2cd', lang: 'ja',
    description: SITE.description,
    icons: [
      { src: '/assets/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/assets/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }, null, 2));

  /* ⚠️ Cloudflare Web Analytics を有効にすると、Pages が配信時に
     https://static.cloudflareinsights.com/beacon.min.js を勝手に注入する。
     script-src に許可が無いと CSP で丸ごとブロックされ、解析が1件も取れないまま
     「有効になっている」ように見える（2026-08-02 に本番の実ブラウザ検証で発見）。
     ビーコンは https://cloudflareinsights.com/cdn-cgi/rum へ送るので connect-src も要る。
     この CSP はローカルの serve.mjs では効かない＝本番URLに当てないと検証できない:
       node scripts/e2e.mjs https://ninnikumap.com */
  const CFI_SCRIPT = 'https://static.cloudflareinsights.com';
  const CFI_CONNECT = 'https://cloudflareinsights.com';

  /* 自社のアクセス解析（cookieless）の送信先。qa.js 自体は同一オリジン配信なので
     script-src は要らず、connect-src だけ通す。
     ⚠️ この _headers はビルドの生成物。quirio-analytics の `npm run sync` が
     public/_headers に当てたパッチは次のビルドで消える（2026-08-04 に本番で発生）。
     許可はここに書くこと。 */
  const QA_ENDPOINT = 'https://quirio-analytics.wataru-okada.workers.dev';

  /* バリューコマース LinkSwitch が使う外部ドメイン（2026-09-24 に本番オリジン上で vcdal.js を実走して観測）:
       script: aml.valuecommerce.com（本体）／dalc.valuecommerce.com（変換ルールの JSONP）
       img   : a.imgvc.com／dalb.valuecommerce.com（ビーコン画像）
     クリック時の遷移先（ck.jp.ap／dalr.valuecommerce.com）はナビゲーションなので CSP の対象外。
     ⚠️ 変換が始まると vcdal.js がインラインscriptを差す経路がある（未実測）。本番で
        `node scripts/e2e.mjs https://ninnikumap.com` を当て、CSP エラーが出たらここを見直す。 */
  const LS_SCRIPT = LS_PID ? ' https://aml.valuecommerce.com https://dalc.valuecommerce.com' : '';
  const LS_IMG = LS_PID ? ' https://a.imgvc.com https://dalb.valuecommerce.com' : '';
  /* MyLink の表示計測ピクセルと画像バナー: ad.jp.ap.valuecommerce.com/servlet/gifbanner が
     i.imgvc.com の実画像（バナー）または 1x1.gif（テキストリンク）へ 302 する（2026-09-25 実測）。 */
  const VC_IMG = (VC_MYLINK.length || VC_BANNER) ? ' https://ad.jp.ap.valuecommerce.com https://i.imgvc.com' : '';
  if (LS_PID) write('linkswitch.js', `/* バリューコマース LinkSwitch の識別子（公開値）。生成元=scripts/build.mjs・設定=/affiliate-config.js */\nvar vc_pid = "${LS_PID}";\n`);
  else if (fs.existsSync(path.join(PUB, 'linkswitch.js'))) fs.unlinkSync(path.join(PUB, 'linkswitch.js'));

  write('_headers', `/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  Content-Security-Policy: default-src 'self'; script-src 'self' ${CFI_SCRIPT}${LS_SCRIPT}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:${LS_IMG}${VC_IMG}; connect-src 'self' ${CFI_CONNECT} ${QA_ENDPOINT}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`);
}

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } }

/* 外部送客リンク。装飾（MyLink）／rel／「広告」表示を必ずセットで出す＝どれか1つだけ付く状態を作らない。
   出典リンクはここを通さない（data-nodal で LinkSwitch からも外す）。 */
function extLink(svc, url, label) {
  /* data-svc: 送客リンクの印。LinkSwitch が href を書き換え data-nodal を付けた後でも、E2E がこの印で見つけられる。 */
  /* MyLink の発行コードはリンクの中に表示計測の 1px 画像を持つ。改変しないため同じ位置に置く。 */
  const px = AFF.impressionPixel(svc, AFF_CFG);
  const pxTag = px ? `<img src="${esc(px)}" height="1" width="0" alt="" style="border:0">` : '';
  return `<a href="${esc(AFF.decorate(svc, url, AFF_CFG))}" rel="${AFF.relFor(svc, AFF_CFG)}" target="_blank" data-svc="${esc(svc)}">${pxTag}${esc(label)}</a>` +
    (AFF.isAffiliated(svc, AFF_CFG) ? '<span class="nm-ad-mark">広告</span>' : '');
}

/* ---------------- 集計を表示 ---------------- */
const counts = regions.map((r) => `${r.name}${byRegion(r.id).length}`).join(' / ');
console.log(`ビルド完了: 全${shops.length}軒`);
console.log(`  地域別: ${counts}`);
console.log(`  ページ: トップ1 + 地域${regions.length} + ジャンル${GENRES.filter((g) => byGenre(g.id).length).length} + 店${shops.length} + 固定4 + 404`);
