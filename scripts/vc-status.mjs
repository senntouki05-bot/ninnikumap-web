/* バリューコマース側の状態を確かめる（ネットワークに出る・読むだけ）。
   使い方: npm run vc:status
   ・LinkSwitch: VC が今どのドメインを変換するか（= dalc.valuecommerce.com/app3 の返すルール）と、
     affiliate-config.js の linkSwitch.services（＝「広告」表示を付けている先）を突き合わせる
   ・画像バナー: gifbanner が実画像へ 302 するか（1x1.gif なら広告主側で停止中）
   ★2026-09-24 はルールが空（content-length 0）、2026-09-25 は tabelog.com が入った＝VC 側の状態は日々変わる。 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
await import(pathToFileURL(path.join(process.cwd(), 'public', 'affiliate-config.js')).href);
await import(pathToFileURL(path.join(process.cwd(), 'public', 'affiliate.js')).href);
const AFF = globalThis.NM_AFF;
const cfg = AFF.loadConfig();
const SITE = 'https://ninnikumap.com/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const HOSTS = { tabelog: 'tabelog.com', hotpepper: 'hotpepper.jp' };
let warn = 0;

const pid = AFF.linkSwitchPid(cfg);
if (pid) {
  const res = await fetch(`https://dalc.valuecommerce.com/app3?p=${pid}&_s=${encodeURIComponent(SITE)}`, { headers: { 'User-Agent': UA, Referer: SITE } });
  const body = await res.text();
  const m = body.match(/^vc_linkswitch_callback\((\{.*\})\)\s*;?\s*$/s);
  const rules = m ? JSON.parse(m[1]) : {};
  const domains = Object.keys(rules).filter((k) => rules[k] && typeof rules[k] === 'object' && rules[k].a);
  console.log(`LinkSwitch pid=${pid}: VC が変換するドメイン ${domains.length} 件${body.length ? '' : '（応答が空＝変換ルールなし）'}`);
  for (const d of domains) console.log('  - ' + d);
  for (const svc of AFF.linkSwitchServices(cfg)) {
    const host = HOSTS[svc] || svc;
    const on = domains.some((d) => d === host || host.endsWith('.' + d) || d.endsWith('.' + host));
    console.log(`  ${on ? '✓' : '!'} ${svc}（${host}）: ${on ? '変換される＝「広告」表示と一致' : '変換されない＝「広告」表示を付けているのに報酬は発生しない（提携の承認待ち？）'}`);
    if (!on) warn++;
  }
} else console.log('LinkSwitch: 未設定');

for (const [slot] of Object.entries(cfg.banners || {})) {
  const b = AFF.banner(slot, cfg);
  if (!b) { console.log(`バナー ${slot}: 設定が不正`); warn++; continue; }
  const res = await fetch(b.img, { redirect: 'manual', headers: { 'User-Agent': UA, Referer: SITE } });
  const loc = res.headers.get('location') || '';
  const live = res.status === 302 && !/1x1\.gif/.test(loc);
  console.log(`バナー ${slot}（${b.w}×${b.h}）: ${res.status} → ${loc || '(なし)'} ${live ? '✓ 配信中' : '! 画像が出ていない'}`);
  if (!live) warn++;
}
console.log(warn ? `\n要確認 ${warn} 件` : '\nVC 側の状態と設定は一致');
