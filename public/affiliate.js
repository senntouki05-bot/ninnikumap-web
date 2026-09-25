/* アフィリエイト・リンク装飾層 — 外部送客の単一チョークポイント。
 *
 * ★設計原則（打ち上げ日和 src/lib/affiliate.ts と同じ規律）:
 *  1. 単一チョークポイント: 外部への送客URLはすべて decorate() を通す。収益化の配線はここ1か所だけ。
 *  2. 未設定なら素通し: 対応するIDが無ければURLを1文字も変えない（＝リンクは壊れない・無報酬で出る）。
 *     ＝代表がIDを入れるまで、この層を入れたままでも安全に公開できる。
 *  3. 形式を推測しない: 公式に確認できた安定フォーマットのASPだけ実装する。
 *     未確認のサービスは STRATEGIES に載せない＝素通し。
 *     誤ったwrapで「計測したつもりの空振り／リンク切れ」を作るより、無装飾で送客する方が安全。
 *
 * ★アフィリIDは秘密ではない: 送客URLに必ず露出する公開値。affiliate-config.js に置く。
 *   未設定は {} ＝全素通し＝収益化オフ。
 *
 * ★このファイルは「ブラウザとNodeの両方の正本」:
 *   ブラウザ … <script src="/affiliate.js"> で window.NM_AFF に生える
 *   Node     … scripts/build.mjs が await import() して globalThis.NM_AFF から読む
 *   （import/export を持たないIIFEなので、そのままESMとして読み込める）
 */
(function (root) {
  'use strict';

  /* --- 楽天アフィリエイト（公式・安定形式）-------------------------------
     https://hb.afl.rakuten.co.jp/hgc/<アフィリID>/?pc=<遷移先URL>&m=<遷移先URL>
     任意の楽天URLを計測付きに包む標準形。<アフィリID> は管理画面で発行される公開値。 */
  function rakutenAfl(url, cfg) {
    var id = (cfg.rakutenAffiliateId || '').trim();
    if (!id) return null;
    var enc = encodeURIComponent(url);
    return 'https://hb.afl.rakuten.co.jp/hgc/' + id + '/?pc=' + enc + '&m=' + enc;
  }

  /* --- バリューコマース MyLink（vc_url 直リンク形式）----------------------
     https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=<sid>&pid=<pid>&vc_url=<遷移先URL>
     sid/pid は提携（広告主プログラム）ごと。VC管理画面の「MyLink」から取得する。
     ※直リンク可否は広告主の許諾に依存。許諾外なら sid/pid を入れない＝素通しのまま。 */
  function valueCommerce(serviceId) {
    return function (url, cfg) {
      var vc = (cfg.valueCommerce || {})[serviceId];
      if (!vc || !(vc.sid || '').trim() || !(vc.pid || '').trim()) return null;
      /* 広告主側の流入元パラメータは「装飾するときだけ」遷移先に足す。
         VCが発行した文字列をそのまま連結する（再エンコードすると発行リンクと一致しなくなる）。 */
      var extra = (vc.params || '').trim().replace(/^[?&]/, '');
      var target = extra ? url + (url.indexOf('?') >= 0 ? '&' : '?') + extra : url;
      return 'https://ck.jp.ap.valuecommerce.com/servlet/referral' +
        '?sid=' + encodeURIComponent(vc.sid.trim()) +
        '&pid=' + encodeURIComponent(vc.pid.trim()) +
        '&vc_url=' + encodeURIComponent(target);
    };
  }

  /* serviceId → 装飾ストラテジ。ここに無いサービスは素通し（＝計測しない）。
     ★実リンク形式を確認できたASPだけ登録する。
       - tabelog / hotpepper … バリューコマースに広告主として存在。提携できたら sid/pid を入れる
       - rakuten_ichiba      … にんにく物販の送客（楽天アフィリのhb.afl形式）
       - 公式サイト・Googleマップ … アフィリなし → 未登録（素通し）
       - Amazonアソシエイト … tag= 形式だが本プロジェクトで未検証のため未登録。
         検証できたら amazon: amazonTag として足す（推測で入れない） */
  var STRATEGIES = {
    tabelog: valueCommerce('tabelog'),
    hotpepper: valueCommerce('hotpepper'),
    rakuten_ichiba: rakutenAfl,
  };

  /* --- バリューコマース LinkSwitch（ページ全体に貼るタグ方式・2026-09-24）----------------
     URL は1文字も変えない。VC のスクリプト（aml.valuecommerce.com/vcdal.js）がページ内の <a> を走査し、
     提携中の広告主へのリンクだけを実行時に計測リンクへ書き換える。
     ★2026-09-24 実測（本番オリジン上で vcdal.js を実走）:
       - 変換ルールは dalc.valuecommerce.com/app3?p=<pid> が返す。空なら何も変換されない
       - <a data-nodal> が付いたリンクは走査から除外される（出典リンクをこれで守る）
       - 読み込み後に追加したリンクは自動では処理されない → window.dalDynamicProcess() を呼ぶと処理される
       - 提携中のプログラムが何かはスクリプトからは分からない → config の services に宣言する */
  var LINKSWITCH_SRC = 'https://aml.valuecommerce.com/vcdal.js';
  var SERVICE_HOSTS = [
    ['tabelog', /(^|\.)tabelog\.com$/],
    ['hotpepper', /(^|\.)hotpepper\.jp$/],
  ];

  /* LinkSwitch の pid。数字以外・未設定は '' ＝ オフ（タグを出さない・広告表示もしない）。 */
  function linkSwitchPid(cfg) {
    cfg = cfg || loadConfig();
    var ls = cfg.linkSwitch;
    if (!ls || typeof ls !== 'object') return '';
    var pid = String(ls.pid == null ? '' : ls.pid).trim();
    return /^[0-9]{1,20}$/.test(pid) ? pid : '';
  }

  /* LinkSwitch で変換対象になる（＝提携中と宣言した）サービスID の配列。pid が無ければ空。 */
  function linkSwitchServices(cfg) {
    cfg = cfg || loadConfig();
    if (!linkSwitchPid(cfg)) return [];
    var arr = cfg.linkSwitch.services;
    if (!Array.isArray(arr)) return [];
    var out = [];
    for (var i = 0; i < arr.length; i++) if (typeof arr[i] === 'string' && arr[i].trim()) out.push(arr[i].trim());
    return out;
  }

  /* URL から送客先サービスIDを引く（公式サイト欄にホットペッパーのページが入っている店がある）。
     該当なしは null。 */
  function serviceOf(url) {
    var host;
    try { host = new URL(String(url || '')).hostname; } catch (e) { return null; }
    for (var i = 0; i < SERVICE_HOSTS.length; i++) if (SERVICE_HOSTS[i][1].test(host)) return SERVICE_HOSTS[i][0];
    return null;
  }

  function linkSwitchCovers(serviceId, cfg) {
    var svcs = linkSwitchServices(cfg);
    for (var i = 0; i < svcs.length; i++) if (svcs[i] === serviceId) return true;
    return false;
  }

  /* --- バリューコマースの表示計測用ピクセル（MyLink 発行コードに入っている 1px 画像）----------
     発行コードは <a …><img src="//ad.jp.ap.valuecommerce.com/servlet/gifbanner?sid=&pid=" height="1" width="0">テキスト</a>。
     表示回数の計測用。クリックの計測には要らないが、発行コードを改変しないため同じ位置に置く。
     その serviceId が MyLink で装飾されるときだけ URL を返す（未設定は ''）。 */
  function impressionPixel(serviceId, cfg) {
    cfg = cfg || loadConfig();
    var vc = (cfg.valueCommerce || {})[serviceId];
    if (!vc || !(vc.sid || '').trim() || !(vc.pid || '').trim()) return '';
    return 'https://ad.jp.ap.valuecommerce.com/servlet/gifbanner?sid=' +
      encodeURIComponent(vc.sid.trim()) + '&pid=' + encodeURIComponent(vc.pid.trim());
  }

  /* --- バリューコマースの画像バナー -------------------------------------------------
     発行コードの <noscript> 側と同じ形: <a href="//ck.jp.ap…/referral?sid=&pid="><img src="//ad.jp.ap…/gifbanner?sid=&pid="></a>
     sid/pid が数字でない・w/h が正の数でないものは null（＝広告枠は「広告募集」の表示のまま）。 */
  function banner(slot, cfg) {
    cfg = cfg || loadConfig();
    var b = (cfg.banners || {})[slot];
    if (!b || typeof b !== 'object') return null;
    var sid = String(b.sid == null ? '' : b.sid).trim();
    var pid = String(b.pid == null ? '' : b.pid).trim();
    var w = Number(b.w), hgt = Number(b.h);
    if (!/^[0-9]{1,20}$/.test(sid) || !/^[0-9]{1,20}$/.test(pid)) return null;
    if (!(w > 0 && w <= 2000) || !(hgt > 0 && hgt <= 2000)) return null;
    var q = '?sid=' + sid + '&pid=' + pid;
    /* maxScale: 枠が広いとき、元の大きさの何倍まで広げてよいか（縦横比は保つ）。
       既定 1＝元の大きさより大きくしない（狭い画面では縮む）。画像は元の画素数しか持たないので、
       広げるほどぼやける＝上限 2。はっきり大きく出したいなら、大きいサイズのバナーを発行して差し替える。 */
    var ms = Number(b.maxScale);
    ms = ms >= 1 ? Math.min(ms, 2) : 1;
    return {
      href: 'https://ck.jp.ap.valuecommerce.com/servlet/referral' + q,
      img: 'https://ad.jp.ap.valuecommerce.com/servlet/gifbanner' + q,
      w: w, h: hgt, maxScale: ms,
      alt: typeof b.alt === 'string' && b.alt.trim() ? b.alt.trim() : '広告',
    };
  }

  function hasAnyBanner(cfg) {
    cfg = cfg || loadConfig();
    var bs = cfg.banners || {};
    for (var k in bs) if (Object.prototype.hasOwnProperty.call(bs, k) && banner(k, cfg)) return true;
    return false;
  }

  /* 外部送客URLを装飾する単一チョークポイント。
     未対応サービス・未設定・空URL・'#' は url をそのまま返す（＝壊さない）。 */
  function decorate(serviceId, url, cfg) {
    if (!url || url === '#') return url;
    cfg = cfg || loadConfig();
    var strat = STRATEGIES[serviceId];
    if (!strat) return url;
    var out = strat(url, cfg);
    return out === null || out === undefined ? url : out;
  }

  /* その serviceId が現在の設定で装飾（＝収益化）対象になるか。開示表示の判定に使う。 */
  function isAffiliated(serviceId, cfg) {
    cfg = cfg || loadConfig();
    if (linkSwitchCovers(serviceId, cfg)) return true;
    var strat = STRATEGIES[serviceId];
    if (!strat) return false;
    return strat('https://example.com/', cfg) != null;
  }

  /* 何らかのアフィリが有効設定済みか（＝収益化オン）。 */
  function hasAnyAffiliate(cfg) {
    cfg = cfg || loadConfig();
    if (linkSwitchPid(cfg)) return true;
    if (hasAnyBanner(cfg)) return true;
    if ((cfg.rakutenAffiliateId || '').trim()) return true;
    var vc = cfg.valueCommerce || {};
    for (var k in vc) {
      if (Object.prototype.hasOwnProperty.call(vc, k) &&
          vc[k] && (vc[k].sid || '').trim() && (vc[k].pid || '').trim()) return true;
    }
    return false;
  }

  /* リンクに付ける rel を返す。
     ★景表法5条3号（ステマ規制・2023-10-01施行）対応:
       報酬が発生するリンクは広告なので rel="sponsored" を付ける。
       装飾されていない（＝無報酬の）リンクには付けない――付けると事実に反する。 */
  function relFor(serviceId, cfg) {
    return isAffiliated(serviceId, cfg)
      ? 'sponsored nofollow noopener'
      : 'nofollow noopener';
  }

  /* 設定を安全に読む（未設定/型不正/例外は {} ＝全素通し）。 */
  function loadConfig() {
    try {
      var g = root.NM_AFFILIATE;
      return g && typeof g === 'object' ? g : {};
    } catch (e) {
      return {};
    }
  }

  /* 地図アプリは詳細カードのリンクを後から描画する。vcdal.js は読み込み時に一度しか走査しないので、
     <a> が増えたら window.dalDynamicProcess()（vcdal.js が公開している再走査関数）を呼ぶ。
     ブラウザでだけ動く（Node のビルドでは document が無いので何もしない）。
     vcdal.js がまだ来ていない／LinkSwitch 未設定なら何もしない＝サイトは壊れない。 */
  var rescanTimer = null;
  function rescanLinkSwitch() {
    if (typeof root.dalDynamicProcess !== 'function') return false;
    if (rescanTimer) clearTimeout(rescanTimer);
    rescanTimer = setTimeout(function () {
      rescanTimer = null;
      try { root.dalDynamicProcess(); } catch (e) { /* VC 側の失敗でサイトを止めない */ }
    }, 120);
    return true;
  }
  function watchDynamicLinks() {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    if (!linkSwitchPid()) return;
    var svcs = linkSwitchServices();
    if (!svcs.length) return;
    var start = function () {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (!n || n.nodeType !== 1) continue;
            var as = n.tagName === 'A' ? [n] : n.querySelectorAll ? n.querySelectorAll('a[href]') : [];
            for (var k = 0; k < as.length; k++) {
              var a = as[k];
              if (a.hasAttribute('data-nodal')) continue;
              var svc = serviceOf(a.getAttribute('href'));
              if (svc && linkSwitchCovers(svc)) { rescanLinkSwitch(); return; }
            }
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }
  try { watchDynamicLinks(); } catch (e) { /* 監視が張れなくても素のリンクとして動く */ }

  root.NM_AFF = {
    decorate: decorate,
    isAffiliated: isAffiliated,
    hasAnyAffiliate: hasAnyAffiliate,
    relFor: relFor,
    loadConfig: loadConfig,
    serviceOf: serviceOf,
    impressionPixel: impressionPixel,
    banner: banner,
    hasAnyBanner: hasAnyBanner,
    linkSwitchPid: linkSwitchPid,
    linkSwitchServices: linkSwitchServices,
    linkSwitchSrc: LINKSWITCH_SRC,
    rescanLinkSwitch: rescanLinkSwitch,
    /* テスト用: 実装済みサービスの一覧 */
    services: Object.keys(STRATEGIES),
  };
})(typeof window !== 'undefined' ? window : globalThis);
