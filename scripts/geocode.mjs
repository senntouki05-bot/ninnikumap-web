/* 住所 → 緯度経度。国土地理院（GSI）の住所検索APIを使う（APIキー不要・公共データ）。
   https://msearch.gsi.go.jp/address-search/AddressSearch?q=<住所>
   ・調査エージェントが座標を裏取りできた店はその値を優先し、ここでは検算だけする
   ・結果は data/geocode-cache.json に保存して再実行のリクエストを減らす
   ・GSIは番地レベルで返らないことがある。その場合ズレを検出して警告する（黙って通さない）
*/
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CACHE_PATH = path.join(ROOT, 'data', 'geocode-cache.json');
const SHOPS_PATH = path.join(ROOT, 'data', 'shops.json');

const cache = fs.existsSync(CACHE_PATH) ? JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) : {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ハーバサイン距離（km） */
function distKm(a, b) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** 「〒039-0201 青森県…（駐車場30台）」のような装飾を落として検索に通る形にする */
function normalizeAddress(addr) {
  return String(addr || '')
    .replace(/〒\s*\d{3}-?\d{4}/g, '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/※.*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** ビル名・階数を削って粒度を粗くした候補を順に作る（GSIは番地までしか持たない） */
function candidates(addr) {
  const base = normalizeAddress(addr);
  const out = [base];
  // 「1-12-11 リガーレ日本橋人形町 A-110」→「1-12-11」
  const m = base.match(/^(.*?\d+(?:[-−‐]\d+)*)\s+\S.*$/);
  if (m) out.push(m[1]);
  // 末尾の「〇F」「〇階」を落とす
  out.push(base.replace(/\s*[B]?\d+\s*[FＦ階].*$/, '').trim());
  // 丁目までに丸める
  const m2 = base.match(/^(.*?[都道府県].*?[市区町村郡].*?)\d/);
  if (m2) out.push(m2[1].trim());
  return [...new Set(out.filter(Boolean))];
}

async function gsi(q) {
  const url = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q);
  const res = await fetch(url, { headers: { 'User-Agent': 'ninniku-map/1.0 (+https://ninnikumap.com)' } });
  if (!res.ok) throw new Error(`GSI ${res.status} for ${q}`);
  const json = await res.json();
  if (!Array.isArray(json) || !json.length) return null;
  const c = json[0]?.geometry?.coordinates;
  if (!c || c.length < 2) return null;
  return { lat: c[1], lon: c[0], matched: json[0]?.properties?.title || '', query: q };
}

export async function geocode(addr) {
  const key = normalizeAddress(addr);
  if (!key) return null;
  if (cache[key] !== undefined) return cache[key];
  let hit = null;
  for (const q of candidates(addr)) {
    try {
      hit = await gsi(q);
    } catch (e) {
      console.warn('  ! GSI失敗:', e.message);
    }
    await sleep(350); // 公開APIへの礼儀として毎秒3回以下に抑える
    if (hit) break;
  }
  cache[key] = hit;
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  return hit;
}

async function main() {
  if (!fs.existsSync(SHOPS_PATH)) {
    console.error('data/shops.json が無い。先に調査結果を書き出すこと。');
    process.exit(1);
  }
  const shops = JSON.parse(fs.readFileSync(SHOPS_PATH, 'utf8'));
  let filled = 0, checked = 0, warned = 0, failed = 0;

  for (const s of shops) {
    const hit = await geocode(s.addr);
    if (!hit) {
      if (s.lat == null || s.lon == null) {
        console.error(`  × ジオコーディング失敗・座標なし: ${s.name} / ${s.addr}`);
        failed++;
      } else {
        console.warn(`  ! GSIヒットなし（調査側の座標を採用）: ${s.name}`);
      }
      continue;
    }
    if (s.lat == null || s.lon == null) {
      s.lat = Math.round(hit.lat * 1e6) / 1e6;
      s.lon = Math.round(hit.lon * 1e6) / 1e6;
      s.geo_source = 'gsi';
      filled++;
    } else {
      const d = distKm({ lat: s.lat, lon: s.lon }, hit);
      checked++;
      if (d > 2.0) {
        // 2km以上ズレている＝どちらかが間違い。住所は裏取り済みなのでGSI側を採る
        console.warn(`  ! 座標がGSIと ${d.toFixed(1)}km ズレ → GSIを採用: ${s.name}`);
        s.lat = Math.round(hit.lat * 1e6) / 1e6;
        s.lon = Math.round(hit.lon * 1e6) / 1e6;
        s.geo_source = 'gsi(差し替え)';
        warned++;
      } else {
        s.geo_source = 'research(GSI照合済み)';
      }
    }
  }

  fs.writeFileSync(SHOPS_PATH, JSON.stringify(shops, null, 2) + '\n');
  console.log(`ジオコーディング完了: 新規付与 ${filled} / 照合 ${checked}（うち差し替え ${warned}） / 失敗 ${failed}`);
  if (failed) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('geocode.mjs')) main();
