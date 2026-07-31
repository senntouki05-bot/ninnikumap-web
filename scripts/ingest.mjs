/* 調査ワークフローの出力（tmp/research.json）を data/shops.json と data/excluded.json に落とす。
   ここでやること:
     - 除外行（閉店・不在・にんにく度0）を excluded へ分ける
     - id を region ごとの連番で振り直す
     - slug は data/slugs.json（手当てしたローマ字辞書）から引く。無ければ止める
       （日本語のURLは避けたい。かといって機械変換で読みを誤ると直せないので、辞書を正本にする）
     - 文字列の正規化（全角空白・改行・重複スペース）
   使い方: node scripts/ingest.mjs tmp/research.json
*/
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const src = process.argv[2] || path.join(ROOT, 'tmp', 'research.json');
const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const slugs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'slugs.json'), 'utf8'));
const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regions.json'), 'utf8'));

const clean = (s) => String(s == null ? '' : s).replace(/　/g, ' ').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

/* 都道府県 → 地域ID（研究側の region 指定より住所を優先する） */
const PREF2REGION = {};
for (const r of regions) for (const p of r.prefs) PREF2REGION[p] = r.id;
function regionFromArea(area, fallback) {
  const pref = Object.keys(PREF2REGION).find((p) => area.startsWith(p));
  return pref ? PREF2REGION[pref] : fallback;
}

const kept = [], missingSlug = [];
const counter = {};

for (const s of raw.shops || []) {
  const name = clean(s.name);
  const area = clean(s.area);
  const region = regionFromArea(area, s.region);
  const slug = slugs[name];
  if (!slug) { missingSlug.push(`${name}  (${area})`); continue; }
  counter[region] = (counter[region] || 0) + 1;
  kept.push({
    id: region.slice(0, 2) + String(counter[region]).padStart(2, '0'),
    slug,
    name,
    region,
    area,
    addr: clean(s.addr),
    hours: clean(s.hours) || '要確認',
    closed_days: clean(s.closed_days),
    tel: clean(s.tel),
    genre: s.genre,
    level: s.level,
    menu: clean(s.menu),
    price: clean(s.price),
    review: clean(s.review),
    lat: typeof s.lat === 'number' && s.lat !== 0 ? s.lat : null,
    lon: typeof s.lon === 'number' && s.lon !== 0 ? s.lon : null,
    official_url: clean(s.official_url),
    tabelog_url: clean(s.tabelog_url),
    sources: (s.sources || []).map(clean).filter(Boolean),
    was_existing: !!s.was_existing,
    corrections: (s.corrections || []).map(clean).filter(Boolean),
  });
}

if (missingSlug.length) {
  console.error('data/slugs.json に slug が無い店:\n' + missingSlug.map((m) => '  × ' + m).join('\n'));
  console.error('\n辞書に追記してから再実行すること（日本語URLを避けるため機械変換はしない）。');
  process.exit(1);
}

fs.writeFileSync(path.join(ROOT, 'data', 'shops.json'), JSON.stringify(kept, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'data', 'excluded.json'), JSON.stringify(raw.excluded || [], null, 2) + '\n');

const byRegion = regions.map((r) => `${r.name}${kept.filter((s) => s.region === r.id).length}`).join(' / ');
const noGeo = kept.filter((s) => s.lat == null).length;
console.log(`取り込み完了: 掲載 ${kept.length} 軒 / 除外 ${(raw.excluded || []).length} 件`);
console.log(`  地域別: ${byRegion}`);
console.log(`  座標未取得（要ジオコーディング）: ${noGeo} 軒`);
