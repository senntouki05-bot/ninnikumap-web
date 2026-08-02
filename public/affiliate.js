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
    var strat = STRATEGIES[serviceId];
    if (!strat) return false;
    return strat('https://example.com/', cfg) != null;
  }

  /* 何らかのアフィリが有効設定済みか（＝収益化オン）。 */
  function hasAnyAffiliate(cfg) {
    cfg = cfg || loadConfig();
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

  root.NM_AFF = {
    decorate: decorate,
    isAffiliated: isAffiliated,
    hasAnyAffiliate: hasAnyAffiliate,
    relFor: relFor,
    loadConfig: loadConfig,
    /* テスト用: 実装済みサービスの一覧 */
    services: Object.keys(STRATEGIES),
  };
})(typeof window !== 'undefined' ? window : globalThis);
