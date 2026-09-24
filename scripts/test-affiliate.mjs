/* アフィリエイト装飾層のユニットテスト。
   ★ここを固める理由: 本番の affiliate-config.js は空（＝収益化オフ）なので、
     通常のビルド・検査では「装飾する側」のコードが一度も実行されない。
     提携が決まってIDを入れた瞬間に初めて動くコードを、無検証で置いておかないこと。
   使い方: node scripts/test-affiliate.mjs */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
globalThis.NM_AFFILIATE = {};
await import(pathToFileURL(path.join(process.cwd(), 'public', 'affiliate.js')).href);
const AFF = globalThis.NM_AFF;

let fails = 0;
const ok = (m) => console.log('  ✓ ' + m);
const bad = (m) => { console.log('  ✗ ' + m); fails++; };
const eq = (got, want, m) => (got === want ? ok(m) : bad(`${m}\n      got : ${got}\n      want: ${want}`));

const TABELOG = 'https://tabelog.com/tokyo/A1303/A130302/13001234/';
const OFF = { };
const RAK = { rakutenAffiliateId: '1a2b3c4d.5e6f7g8h' };
const VC = { valueCommerce: { tabelog: { sid: '1234567', pid: '890123456' } } };
const VCP = { valueCommerce: { tabelog: { sid: '1234567', pid: '890123456', params: 'utm_source=valuecommerce' } } };

console.log('\n― 未設定なら1文字も変えない（最重要の不変条件）―');
eq(AFF.decorate('tabelog', TABELOG, OFF), TABELOG, '食べログ: 未提携なら素通し');
eq(AFF.decorate('rakuten_ichiba', 'https://item.rakuten.co.jp/x/y/', OFF), 'https://item.rakuten.co.jp/x/y/', '楽天: 未設定なら素通し');
eq(AFF.decorate('official', 'https://example.com/', RAK), 'https://example.com/', '未登録サービスは素通し');
eq(AFF.decorate('tabelog', '', VC), '', '空URLは空のまま');
eq(AFF.decorate('tabelog', '#', VC), '#', "'#' は素通し");
eq(AFF.hasAnyAffiliate(OFF), false, '空設定は収益化オフ');
eq(AFF.hasAnyAffiliate({ valueCommerce: { tabelog: { sid: '', pid: '' } } }), false, '空文字のsid/pidは未設定扱い');

console.log('\n― 設定したら正しい形式で装飾する ―');
eq(
  AFF.decorate('rakuten_ichiba', 'https://item.rakuten.co.jp/x/y/', RAK),
  'https://hb.afl.rakuten.co.jp/hgc/1a2b3c4d.5e6f7g8h/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fx%2Fy%2F&m=https%3A%2F%2Fitem.rakuten.co.jp%2Fx%2Fy%2F',
  '楽天: hb.afl 形式に包む'
);
eq(
  AFF.decorate('tabelog', TABELOG, VC),
  'https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=1234567&pid=890123456&vc_url=' + encodeURIComponent(TABELOG),
  'VC: vc_url 形式に包む'
);
eq(
  AFF.decorate('tabelog', TABELOG, VCP),
  'https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=1234567&pid=890123456&vc_url=' + encodeURIComponent(TABELOG + '?utm_source=valuecommerce'),
  'VC: params は遷移先に付けてから包む'
);
eq(AFF.hasAnyAffiliate(RAK), true, '楽天IDありは収益化オン');
eq(AFF.hasAnyAffiliate(VC), true, 'VC提携ありは収益化オン');

console.log('\n― 景表法5条3号: 装飾したリンクにだけ sponsored を付ける ―');
eq(AFF.relFor('tabelog', OFF), 'nofollow noopener', '未提携: sponsored を付けない（付けたら事実と違う）');
eq(AFF.relFor('tabelog', VC), 'sponsored nofollow noopener', '提携済: sponsored を付ける');
eq(AFF.relFor('official', RAK), 'nofollow noopener', '未登録サービス: sponsored なし');
eq(AFF.isAffiliated('tabelog', OFF), false, 'isAffiliated: 未提携');
eq(AFF.isAffiliated('tabelog', VC), true, 'isAffiliated: 提携済');

console.log('\n― バリューコマース LinkSwitch（タグ方式）―');
const LS = { linkSwitch: { pid: '892711261', services: ['hotpepper'] } };
const HP = 'https://www.hotpepper.jp/strJ003851166/';
eq(AFF.linkSwitchPid(LS), '892711261', 'pid を数字として読む');
eq(AFF.linkSwitchPid({ linkSwitch: { pid: ' 892711261 ' } }), '892711261', 'pid の前後の空白は捨てる');
eq(AFF.linkSwitchPid({ linkSwitch: { pid: 'abc' } }), '', '数字でない pid は未設定扱い（素通し）');
eq(AFF.linkSwitchPid({ linkSwitch: { pid: '892711261"><script>' } }), '', 'HTMLを壊す文字列は未設定扱い');
eq(AFF.linkSwitchPid(OFF), '', '未設定は空');
eq(AFF.linkSwitchServices(LS).join(','), 'hotpepper', 'services を読む');
eq(AFF.linkSwitchServices({ linkSwitch: { pid: '', services: ['hotpepper'] } }).length, 0, 'pid が無ければ services も空（タグが載らないので変換されない）');
eq(AFF.decorate('hotpepper', HP, LS), HP, 'LinkSwitch は URL を1文字も変えない（変換は VC のスクリプトが実行時に行う）');
eq(AFF.isAffiliated('hotpepper', LS), true, '宣言したサービスは提携中');
eq(AFF.isAffiliated('tabelog', LS), false, '宣言していないサービスは提携扱いしない');
eq(AFF.relFor('hotpepper', LS), 'sponsored nofollow noopener', '変換されるリンクには sponsored');
eq(AFF.relFor('tabelog', LS), 'nofollow noopener', '変換されないリンクには付けない');
eq(AFF.hasAnyAffiliate(LS), true, 'pid があれば収益化オン（開示文が切り替わる）');
eq(AFF.hasAnyAffiliate({ linkSwitch: { pid: '892711261' } }), true, 'services が空でも pid があれば収益化オン（過剰開示の側に倒す）');
eq(AFF.serviceOf(HP), 'hotpepper', 'URL → hotpepper');
eq(AFF.serviceOf(TABELOG), 'tabelog', 'URL → tabelog');
eq(AFF.serviceOf('https://diamondninniku.com/'), null, '公式サイトは該当なし');
eq(AFF.serviceOf('https://hotpepper.jp.example.com/'), null, 'ドメインの末尾一致だけを見る（偽装ドメインに当たらない）');
eq(AFF.serviceOf(''), null, '空URLは null');
eq(AFF.serviceOf('not a url'), null, '壊れたURLは null');
eq(AFF.linkSwitchSrc, 'https://aml.valuecommerce.com/vcdal.js', 'スクリプトの正本URL');
eq(AFF.rescanLinkSwitch(), false, 'vcdal.js が無い環境では再走査しない（false）');

console.log('\n― 壊れた設定でも落ちない ―');
for (const broken of [null, undefined, 'string', 42, { valueCommerce: null }, { valueCommerce: { tabelog: null } }, { rakutenAffiliateId: null }, { linkSwitch: null }, { linkSwitch: 'x' }, { linkSwitch: { pid: 123, services: 'hotpepper' } }, { linkSwitch: { pid: null, services: [null, 1] } }]) {
  try {
    const r = AFF.decorate('tabelog', TABELOG, broken || {});
    if (typeof r !== 'string') bad(`壊れた設定で文字列以外が返った: ${JSON.stringify(broken)}`);
    AFF.linkSwitchPid(broken || {}); AFF.linkSwitchServices(broken || {}); AFF.isAffiliated('hotpepper', broken || {}); AFF.hasAnyAffiliate(broken || {});
  } catch (e) {
    bad(`壊れた設定で例外: ${JSON.stringify(broken)} — ${e.message}`);
  }
}
ok('壊れた設定11種すべてで例外なし・素通し');

console.log(fails ? `\n不合格 ${fails} 件` : '\nアフィリエイト層 すべて合格');
process.exit(fails ? 1 : 0);
