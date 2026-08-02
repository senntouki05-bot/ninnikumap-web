/* にんにくマップ — 描画層
   claude design「案2c-リスト左・広告下」のテンプレートを、dcランタイム(support.js/React)無しで再現する。
   ・見た目・寸法・配色・演出はテンプレートの inline style をそのまま移植
   ・sc-for / sc-if / {{ }} の代わりに、下の小さなキー付きvdomで差分更新する
     （毎フレーム innerHTML を捨てると gkBob 等のCSSアニメが再スタートしてしまうため）
*/
(function () {
  'use strict';

  /* ============================ 最小vdom ============================ */
  var SVG = { svg: 1, g: 1, path: 1, use: 1, defs: 1, ellipse: 1, rect: 1, circle: 1, line: 1, polygon: 1, polyline: 1, text: 1, tspan: 1, linearGradient: 1, radialGradient: 1, stop: 1, clipPath: 1, filter: 1, feGaussianBlur: 1, image: 1, mask: 1 };
  var NS = 'http://www.w3.org/2000/svg';

  function norm(a) { return (a && typeof a === 'object') ? a : { t: '#text', v: String(a) }; }

  function h(t, p) {
    p = p || {};
    var kids = [];
    for (var i = 2; i < arguments.length; i++) {
      var a = arguments[i];
      if (a == null || a === false || a === '') continue;
      if (Array.isArray(a)) {
        for (var j = 0; j < a.length; j++) if (a[j] != null && a[j] !== false && a[j] !== '') kids.push(norm(a[j]));
      } else kids.push(norm(a));
    }
    return { t: t, k: p.key, p: p, c: kids };
  }

  function setStyle(el, oldS, newS) {
    oldS = oldS || {}; newS = newS || {};
    var k;
    for (k in newS) if (newS[k] !== oldS[k]) el.style.setProperty(k, newS[k] == null ? '' : String(newS[k]));
    for (k in oldS) if (!(k in newS)) el.style.removeProperty(k);
  }

  function setAttrs(el, oldA, newA, svg) {
    oldA = oldA || {}; newA = newA || {};
    var k;
    for (k in newA) {
      if (newA[k] === oldA[k]) continue;
      if (newA[k] == null || newA[k] === false) el.removeAttribute(k);
      else el.setAttribute(k, String(newA[k]));
    }
    for (k in oldA) if (!(k in newA)) el.removeAttribute(k);
  }

  function bindEvents(el, p) {
    // ハンドラは el.__ev に差し替え、リスナー自体は種類ごとに1回だけ張る
    el.__ev = el.__ev || {};
    el.__bound = el.__bound || {};
    ['click', 'input', 'change', 'keydown'].forEach(function (type) {
      var key = 'on' + type.charAt(0).toUpperCase() + type.slice(1);
      if (p[key]) {
        el.__ev[type] = p[key];
        if (!el.__bound[type]) {
          el.__bound[type] = true;
          el.addEventListener(type, function (ev) { var f = el.__ev[type]; if (f) f(ev); });
        }
      } else if (el.__ev[type]) {
        el.__ev[type] = null;
      }
    });
  }

  function applyProps(el, oldP, p, created) {
    if (created && p.css) el.style.cssText = p.css;
    else if (!created && p.css !== (oldP && oldP.css)) el.style.cssText = p.css || '';
    setStyle(el, created ? null : (oldP && oldP.style), p.style);
    setAttrs(el, created ? null : (oldP && oldP.attrs), p.attrs);
    if (p.cls !== (oldP && oldP.cls)) { if (p.cls) el.setAttribute('class', p.cls); else el.removeAttribute('class'); }
    bindEvents(el, p);
    if ('value' in p && el.value !== p.value) el.value = p.value;
    if (created && p.ref) p.ref(el);
  }

  function createEl(v) {
    if (v.t === '#text') { v.e = document.createTextNode(v.v); return v.e; }
    var el = SVG[v.t] ? document.createElementNS(NS, v.t) : document.createElement(v.t);
    v.e = el;
    applyProps(el, null, v.p, true);
    for (var i = 0; i < v.c.length; i++) el.appendChild(createEl(v.c[i]));
    return el;
  }

  function patchNode(ov, nv) {
    nv.e = ov.e;
    if (nv.t === '#text') { if (nv.v !== ov.v) nv.e.nodeValue = nv.v; return; }
    applyProps(nv.e, ov.p, nv.p, false);
    patchChildren(nv.e, ov.c, nv.c);
  }

  function patchChildren(el, oldC, newC) {
    var oldKeyed = Object.create(null), oldUn = [], i;
    for (i = 0; i < oldC.length; i++) {
      if (oldC[i].k != null) oldKeyed[oldC[i].k] = oldC[i]; else oldUn.push(oldC[i]);
    }
    var unIdx = 0, matched = [];
    for (i = 0; i < newC.length; i++) {
      var nv = newC[i], ov = null;
      if (nv.k != null) ov = oldKeyed[nv.k] || null;
      else ov = oldUn[unIdx++] || null;
      if (ov && ov.t !== nv.t) ov = null;
      if (ov) { matched.push(ov); patchNode(ov, nv); }
      else createEl(nv);
    }
    for (i = 0; i < oldC.length; i++) {
      if (matched.indexOf(oldC[i]) < 0 && oldC[i].e && oldC[i].e.parentNode === el) el.removeChild(oldC[i].e);
    }
    var cur = el.firstChild;
    for (i = 0; i < newC.length; i++) {
      var e = newC[i].e;
      if (cur === e) cur = cur.nextSibling;
      else el.insertBefore(e, cur);
    }
    while (cur) { var nx = cur.nextSibling; el.removeChild(cur); cur = nx; }
  }

  function mount(root, vnodeFn) {
    var prev = null;
    return function render() {
      var next = vnodeFn();
      if (!prev) { root.appendChild(createEl(next)); }
      else if (prev.t !== next.t) { root.replaceChild(createEl(next), prev.e); }
      else patchNode(prev, next);
      prev = next;
    };
  }

  /* ============================ 状態コンテナ ============================ */
  function Component(initial) {
    this.state = initial;
    this._pending = false;
    this._render = null;
  }
  Component.prototype.setState = function (patch) {
    var p = (typeof patch === 'function') ? patch(this.state) : patch;
    var changed = false, k;
    for (k in p) { if (this.state[k] !== p[k]) { this.state[k] = p[k]; changed = true; } }
    if (changed) this.forceUpdate();
  };
  Component.prototype.forceUpdate = function () {
    if (this._pending) return;
    this._pending = true;
    var self = this;
    requestAnimationFrame(function () { self._pending = false; if (self._render) self._render(); });
  };

  /* ============================ 素材 ============================ */
  var A = './assets/';
  var PIN_D = 'M146 48C144.2 51.7 143 57 142 62C141 67 140.7 72.7 140 78C139.3 83.3 138.7 88.3 138 94C137.3 99.7 137.2 109 136 112C134.8 115 134 110.5 131 112C128 113.5 122.7 117.8 118 121C113.3 124.2 108 127.5 103 131C98 134.5 92.8 138.3 88 142C83.2 145.7 78.3 149.2 74 153C69.7 156.8 65.5 161 62 165C58.5 169 55.7 173 53 177C50.3 181 47.7 185 46 189C44.3 193 43.7 197 43 201C42.3 205 42 209 42 213C42 217 42.2 221 43 225C43.8 229 45.3 233.2 47 237C48.7 240.8 50.5 244.3 53 248C55.5 251.7 58.7 255.5 62 259C65.3 262.5 69.2 265.8 73 269C76.8 272.2 80.8 275.2 85 278C89.2 280.8 93.7 283.7 98 286C102.3 288.3 108.7 290.2 111 292C113.3 293.8 109.2 297 112 297C114.8 297 122.5 291.3 128 292C133.5 292.7 139.2 300.3 145 301C150.8 301.7 157 296 163 296C169 296 175.2 301.7 181 301C186.8 300.3 192.5 292.7 198 292C203.5 291.3 211.2 297 214 297C216.8 297 212.7 293.8 215 292C217.3 290.2 223.7 288.3 228 286C232.3 283.7 236.8 280.8 241 278C245.2 275.2 249.2 272.2 253 269C256.8 265.8 260.7 262.5 264 259C267.3 255.5 270.5 251.7 273 248C275.5 244.3 277.3 240.8 279 237C280.7 233.2 282.2 229 283 225C283.8 221 284 217 284 213C284 209 283.7 205 283 201C282.3 197 281.7 193 280 189C278.3 185 275.7 181 273 177C270.3 173 267.5 169 264 165C260.5 161 256.3 156.8 252 153C247.7 149.2 242.8 145.7 238 142C233.2 138.3 228 134.5 223 131C218 127.5 212.7 124.2 208 121C203.3 117.8 198 113.5 195 112C192 110.5 191.2 115 190 112C188.8 109 188.7 99.7 188 94C187.3 88.3 186.7 83.3 186 78C185.3 72.7 184.5 67 184 62C183.5 57 184.3 51.7 183 48C181.7 44.3 179.2 41.8 176 40C172.8 38.2 167.8 37 164 37C160.2 37 156 38.2 153 40C150 41.8 147.8 44.3 146 48Z';

  function img(src, css, alt, eager) {
    return h('img', { attrs: { src: src, alt: alt || '', loading: eager ? 'eager' : 'lazy', decoding: 'async', fetchpriority: eager ? 'high' : null }, css: css });
  }

  /* 地域ピンの中に入る小さめのにんにく（テンプレート内SVGをそのまま） */
  function regionGarlic() {
    return h('svg', { attrs: { viewBox: '20 24 292 301', 'aria-hidden': 'true' }, css: 'width:28px;height:28.9px;flex:none;display:block;overflow:visible;' },
      h('path', { attrs: { d: PIN_D, fill: '#f7f0e2', stroke: '#6b4630', 'stroke-width': '4', 'stroke-linejoin': 'round' } }),
      h('g', { attrs: { fill: 'none', stroke: '#6b4630', 'stroke-opacity': '.5', 'stroke-width': '3', 'stroke-linecap': 'round' } },
        h('path', { attrs: { d: 'M152 118Q172 220 132 292' } }),
        h('path', { attrs: { d: 'M174 118Q214 214 194 292' } })
      ),
      h('ellipse', { attrs: { cx: '164', cy: '46', rx: '16', ry: '7', fill: '#c9a473', stroke: '#6b4630', 'stroke-width': '4' } })
    );
  }

  /* 店ピン本体（テンプレート内SVGをそのまま） */
  function shopGarlic() {
    return h('svg', { attrs: { viewBox: '20 24 292 301', 'aria-hidden': 'true' }, css: 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;' },
      h('path', { attrs: { d: PIN_D, fill: '#f7f0e2' } }),
      h('g', { attrs: { fill: 'none', stroke: '#6b4630', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } },
        h('path', { attrs: { d: PIN_D, 'stroke-width': '5' } }),
        h('g', { attrs: { 'stroke-width': '2.8', 'stroke-opacity': '.58' } },
          h('path', { attrs: { d: 'M147 116Q160.9 219 115.5 287.1' } }),
          h('path', { attrs: { d: 'M156 112Q186.1 219.5 149.1 299.3' } }),
          h('path', { attrs: { d: 'M170 112Q221.6 211.1 201.7 296.9' } }),
          h('path', { attrs: { d: 'M179 116Q240.2 200 232.6 281.5' } })
        ),
        h('path', { attrs: { d: 'M137 110Q141 70 146 50', 'stroke-width': '2.8', 'stroke-opacity': '.55' } }),
        h('path', { attrs: { d: 'M189 110Q185 70 183 50', 'stroke-width': '2.8', 'stroke-opacity': '.55' } })
      ),
      h('ellipse', { attrs: { cx: '164', cy: '46', rx: '17', ry: '7.6', fill: '#c9a473', stroke: '#6b4630', 'stroke-width': '4.4', transform: 'rotate(-5 164 46)' } })
    );
  }

  /* ============================ 広告枠 ============================ */
  /* ⚠️ aspect-ratio と min-height を併記すると、min-height が比率を通って
     「幅の下限」に化ける（728×90枠なら 88px × 728/90 ＝ 712px）。
     min-width:0 では止まらないので max-width:100% で必ず頭を抑えること。
     元デザインはルートの overflow:hidden に隠れていただけで、はみ出し自体は起きていた。 */
  var ADS = window.NM_ADS || {};

  /* アフィリエイト装飾層。読み込みに失敗しても「素通し」で動くフォールバックを持たせる
     ＝収益化の配線が落ちてもサイト自体は壊れない（リンクは無報酬の素リンクとして機能する）。 */
  var AFF = window.NM_AFF || {
    decorate: function (svc, url) { return url; },
    isAffiliated: function () { return false; },
    relFor: function () { return 'nofollow noopener'; },
    hasAnyAffiliate: function () { return false; },
  };

  function adSlot(sizeLabel, boxCss, key) {
    boxCss = 'min-width:0;max-width:100%;' + boxCss;
    var ad = ADS[key];
    if (ad && ad.html) {
      /* 実広告を出すときは「広告」と分かる表示を必ず添える（景表法5条3号・ステマ規制）。 */
      var box = h('div', { css: boxCss + 'overflow:hidden;position:relative;' });
      box.p.__html = ad.html;
      return h('div', { css: 'position:relative;min-width:0;max-width:100%;' },
        box,
        h('span', { cls: 'nm-ad-mark', css: 'position:absolute;top:2px;left:2px;' }, '広告')
      );
    }
    return h('a', {
      attrs: { href: (ADS.inquiryUrl || './contact/'), rel: 'nofollow' },
      css: boxCss + 'text-decoration:none;',
    }, h('span', { css: "font-family:'Roboto Mono',monospace;font-size:11px;color:#a8906e;white-space:nowrap;text-align:center;line-height:1.7;" }, sizeLabel));
  }

  /* ============================ 画面 ============================ */
  function App() {
    var cmp = new Component({
      view: 'japan', region: null, shop: null, pending: null, filter: 'all', q: '',
      counter: 0, parts: [], combo: 0, enter: 1, landed: false, lmode: 'callout',
      tilt: 27, hold: 420
    });

    var ctl = window.GK.controller(cmp, {
      tilt: 27, rz: -8, lift: 24,
      hold: 420, wave: 'triangle',
      minGap: 62, minGapRegion: 88, labelMode: 'callout',
      partColors: ['#fff6e0', '#f3d08a', '#e8a35f', '#c3dcab'],
      blockColors: ['#fdf6e6', '#f0e2c6', '#e6d3b0'], landDelay: 540
    });

    var stripe = 'background:repeating-linear-gradient(135deg,#eee0c6 0 9px,#f7ecd9 9px 18px);';

    function view() {
      var v = ctl.vals();

      /* ---- 広告帯（order:3 ＝ 一番下） ---- */
      var adRow = h('div', { css: 'position:relative;order:3;flex:1 1 100%;max-width:1290px;display:flex;flex-direction:row;flex-wrap:wrap;align-items:stretch;gap:14px;' },
        h('div', { css: 'flex:3 1 420px;background:#fffaf0;border:3px solid #cbb392;border-radius:18px;padding:10px 10px 12px;box-shadow:0 8px 0 #d5bd9c,0 14px 22px rgba(90,64,36,.18);' },
          h('div', { css: 'display:flex;align-items:center;justify-content:center;gap:5px;margin-bottom:8px;' },
            img(A + 'garlic-sm.svg', 'width:17px;height:17.5px;flex:none;display:block;'),
            h('span', { css: "font-family:'Roboto Mono',monospace;font-size:10px;letter-spacing:.14em;color:#a8906e;" }, 'SPONSOR')
          ),
          adSlot('この横長の枠に広告を出せます（728 × 90）', 'height:88px;border-radius:12px;' + stripe + 'display:flex;align-items:center;justify-content:center;', 'leaderboard')
        ),
        h('div', { css: 'flex:1 1 200px;background:#fffaf0;border:3px solid #cbb392;border-radius:18px;padding:10px;box-shadow:0 8px 0 #d5bd9c,0 14px 22px rgba(90,64,36,.18);display:flex;flex-direction:column;justify-content:center;' },
          adSlot('300 × 250', 'aspect-ratio:300/250;max-height:110px;border-radius:12px;' + stripe + 'display:flex;align-items:center;justify-content:center;', 'rect'),
          h('a', { attrs: { href: './contact/' }, css: 'font-size:11px;color:#a8906e;text-align:center;margin-top:7px;display:block;text-decoration:none;' }, 'この看板を出したい人はこちら')
        ),
        h('a', { attrs: { href: './contact/' }, css: 'flex:1 1 180px;background:#fff2e4;border:3px dashed #e6c8a8;border-radius:18px;padding:12px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;text-decoration:none;' },
          img(A + 'garlic.svg', 'width:44px;height:45.4px;margin:0 auto 6px;display:block;animation:gkTilt 5s ease-in-out infinite;'),
          h('span', { css: 'font-size:11px;line-height:1.7;color:#a8785a;' }, 'お店の掲載も'), h('br', {}), h('span', { css: 'font-size:11px;line-height:1.7;color:#a8785a;' }, '受け付けてるよ')
        )
      );

      /* ---- 見出し ---- */
      var header = h('div', { css: 'display:flex;align-items:center;gap:14px;flex-wrap:wrap;' },
        img(A + 'garlic.svg', 'width:62px;height:64px;flex:none;display:block;animation:gkBob 4s ease-in-out infinite;', '', true),
        h('div', { css: 'flex:0 1 300px;' },
          h('div', { css: "font-family:'Zen Maru Gothic',serif;font-weight:900;font-size:clamp(26px,4vw,38px);line-height:1.1;color:#4a3a2a;text-shadow:0 2px 0 #fff8ea,0 4px 0 rgba(150,120,80,.25);" }, 'にんにくマップ'),
          h('div', { css: 'font-size:13px;color:#8a7358;margin-top:4px;' },
            '日本のにんにく専門店やにんにく料理が名物のお店を全部まとめました！', h('br', {}),
            'にんにく好きのための「にんにくマップ」です。')
        ),
        h('div', { css: 'flex:2 1 340px;min-width:260px;background:#fffaf0;border:3px solid #cbb392;border-radius:18px;padding:8px 10px;box-shadow:0 6px 0 #d5bd9c;display:flex;align-items:center;gap:10px;' },
          h('div', { css: "writing-mode:vertical-rl;font-family:'Roboto Mono',monospace;font-size:9px;letter-spacing:.14em;color:#a8906e;" }, 'SPONSOR'),
          adSlot('468 × 60', 'flex:1;height:52px;border-radius:10px;' + stripe + 'display:flex;align-items:center;justify-content:center;', 'banner')
        ),
        h('div', { css: 'display:flex;align-items:flex-end;gap:8px;background:#fffaf0;border:3px solid #cbb392;border-radius:20px;padding:8px 16px 6px;box-shadow:0 6px 0 #d5bd9c;' },
          h('div', { css: "font-family:'Zen Maru Gothic',serif;font-weight:900;font-size:34px;line-height:1;color:#d0663c;" }, String(v.counter)),
          h('div', { css: 'font-size:12px;color:#8a7358;padding-bottom:5px;' }, '軒あるよ')
        )
      );

      /* ---- 絞り込み ---- */
      var chips = h('div', { css: 'display:flex;flex-wrap:wrap;gap:7px;align-items:center;' },
        h('div', { css: 'display:flex;align-items:center;gap:7px;background:#fffaf0;border:2px solid #d8c3a2;border-radius:999px;padding:6px 14px;box-shadow:0 3px 0 #ddc7a6;' },
          img(A + 'garlic-sm.svg', 'width:19px;height:19.6px;flex:none;display:block;'),
          h('input', {
            value: v.q, onInput: v.onSearch,
            attrs: { placeholder: 'お店・エリアでさがす', type: 'search', 'aria-label': 'お店・エリアでさがす' },
            css: 'border:0;outline:0;background:transparent;font-size:13px;width:144px;color:#4a3a2a;'
          })
        ),
        v.genres.map(function (g) {
          return h('button', {
            key: 'g' + g.id, cls: 'nm-chip', onClick: g.onTap,
            attrs: { type: 'button', 'aria-pressed': g.active ? 'true' : 'false' },
            css: 'border:2px solid #d8c3a2;font-family:inherit;font-size:12px;font-weight:800;padding:7px 13px;border-radius:999px;cursor:pointer;box-shadow:0 3px 0 #ddc7a6;',
            style: { background: g.active ? '#d0663c' : '#fffaf0', color: g.active ? '#fff6e6' : '#7a6448' }
          }, g.label);
        }),
        v.levelChips.map(function (l) {
          return h('button', {
            key: 'l' + l.id, cls: 'nm-lvchip', onClick: l.onTap,
            attrs: { type: 'button', 'aria-pressed': l.active ? 'true' : 'false' },
            css: 'display:flex;align-items:center;gap:5px;border:2px solid #e6b48f;font-family:inherit;font-size:12px;font-weight:800;padding:6px 12px;border-radius:999px;cursor:pointer;box-shadow:0 3px 0 #eec4a3;',
            style: { background: l.active ? '#d0663c' : '#fff2e4', color: l.active ? '#fff6e6' : '#c0562f' }
          },
            img(A + 'garlic-sm-orange.svg', 'width:17px;height:17.5px;flex:none;display:block;'),
            l.stars + ' ' + l.label);
        })
      );

      /* ---- 地図の板（3D） ---- */
      var mapSvg = h('svg', {
        attrs: { viewBox: '0 0 600 900', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
        css: 'position:absolute;left:0;top:0;transform-origin:0 0;overflow:visible;shape-rendering:geometricPrecision;',
        style: { width: v.svgW + 'px', height: v.svgH + 'px' }
      },
        h('g', { attrs: { fill: '#8aa87c' } }, v.geoPathsSmooth.map(function (d, i) {
          return h('path', { key: 'e2' + i, attrs: { d: d, transform: v.exTf2 } });
        })),
        h('g', { attrs: { fill: '#9dbb8a' } }, v.geoPathsSmooth.map(function (d, i) {
          return h('path', { key: 'e1' + i, attrs: { d: d, transform: v.exTf1 } });
        })),
        h('g', { attrs: { fill: '#c3dcab', stroke: '#fdf6e6', 'stroke-width': v.strokeW, 'stroke-linejoin': 'round' } },
          v.geoPathsSmooth.map(function (d, i) { return h('path', { key: 'e0' + i, attrs: { d: d } }); }))
      );

      var regionLayer = v.isJapan ? h('div', { key: 'regionLayer', css: 'position:absolute;left:0;top:0;' },
        h('div', {}, v.regionPins.map(function (r) {
          return h('div', {
            key: 'rs' + r.id,
            css: 'position:absolute;left:0;top:0;width:54px;height:16px;margin:-8px -27px;border-radius:50%;background:rgba(70,90,60,.34);filter:blur(4px);transform-origin:0 0;',
            style: { transform: r.shadowTf, opacity: r.shOp }
          });
        })),
        h('div', {}, v.regionPins.map(function (r) {
          return h('div', {
            key: 'rl' + r.id,
            css: 'position:absolute;left:0;top:0;transform-origin:0 0;background:rgba(80,100,70,.45);',
            style: { transform: r.leaderTf, width: r.leaderW + 'px', height: r.leaderH + 'px', opacity: r.shOp }
          });
        })),
        h('div', {}, v.regionPins.map(function (r) {
          return h('div', {
            key: 'rp' + r.id, cls: 'nm-rpin', onClick: r.onTap,
            css: 'position:absolute;left:0;top:0;transform-origin:0 0;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;',
            style: { transform: r.tf + ' translate(-50%,-100%)', opacity: r.op }
          },
            h('div', { css: 'background:#fffaf0;border:3px solid #cbb392;border-radius:16px;padding:5px 11px 6px;box-shadow:0 5px 0 #cdb28d,0 10px 14px rgba(70,50,30,.22);display:flex;align-items:center;gap:7px;white-space:nowrap;' },
              regionGarlic(),
              h('span', { css: "font-family:'Zen Maru Gothic',serif;font-weight:900;font-size:14px;color:#4a3a2a;" }, r.name),
              h('span', { css: "font-family:'Zen Maru Gothic',serif;font-weight:900;font-size:15px;color:#d0663c;" }, String(r.count))
            ),
            h('div', { css: 'width:3px;height:16px;background:#cbb392;border-radius:2px;' })
          );
        }))
      ) : null;

      var pinLayer = v.isRegion ? h('div', { key: 'pinLayer', css: 'position:absolute;left:0;top:0;' },
        h('div', {}, v.pins.map(function (p) {
          return h('div', {
            key: 'ps' + p.id,
            css: 'position:absolute;left:0;top:0;width:34px;height:12px;margin:-6px -17px;border-radius:50%;background:rgba(70,90,60,.36);filter:blur(3px);transform-origin:0 0;',
            style: { transform: p.shadowTf, opacity: p.shOp }
          });
        })),
        h('div', {}, v.pins.map(function (p) {
          return h('div', {
            key: 'pl' + p.id,
            css: 'position:absolute;left:0;top:0;transform-origin:0 0;background:rgba(80,100,70,.5);',
            style: { transform: p.leaderTf, width: p.leaderW + 'px', height: p.leaderH + 'px', opacity: p.shOp }
          });
        })),
        h('div', {}, v.pins.map(function (p) {
          return h('div', {
            key: 'pp' + p.id, cls: 'nm-pin', onClick: p.onTap,
            css: 'position:absolute;left:0;top:0;transform-origin:0 0;cursor:pointer;display:flex;flex-direction:column;align-items:center;padding:6px 8px 2px;',
            style: { transform: p.tf + ' translate(-50%,-100%)', opacity: p.op }
          },
            h('div', { css: 'position:relative;width:40px;height:41px;margin:2px 6px 6px;animation:gkBob 2.6s ease-in-out infinite;' },
              shopGarlic(),
              h('div', { css: 'position:absolute;left:50%;bottom:-6px;transform:translateX(-50%);background:#fffaf0;border:1.5px solid #cbb392;border-radius:999px;padding:0 4px 1px;font-size:9px;font-weight:800;color:#c0562f;letter-spacing:-.5px;line-height:1.5;white-space:nowrap;box-shadow:0 2px 0 rgba(120,90,60,.25);' }, p.starsOn),
              p.pendingNow ? h('div', { key: 'ring', css: 'position:absolute;left:50%;top:60%;width:48px;height:48px;border:3px solid #f0a882;border-radius:50%;animation:gkRing .42s ease-out forwards;' }) : null
            )
          );
        }))
      ) : null;

      var board = h('div', {
        key: 'board',
        css: 'position:absolute;left:50%;top:50%;width:600px;height:900px;margin:-450px 0 0 -300px;transform-style:preserve-3d;transition:transform .82s cubic-bezier(.22,1.32,.36,1);',
        style: { transform: v.boardTf }
      }, mapSvg, regionLayer, pinLayer);

      /* ---- 当たり判定＋ラベル（板の外・画面平面） ---- */
      var hitJapan = v.isJapan ? h('div', { key: 'hitJapan', css: 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;' },
        v.regionPins.map(function (r) {
          return h('button', {
            key: 'rh' + r.id, onClick: r.onTap,
            attrs: { type: 'button', title: r.name, 'aria-label': r.name + ' ' + r.count + '軒' },
            css: 'position:absolute;transform:translate(-50%,-100%);width:150px;height:56px;border-radius:18px;pointer-events:auto;cursor:pointer;background:transparent;border:0;padding:0;',
            style: { left: r.sx + 'px', top: r.sy + 'px' }
          });
        })
      ) : null;

      var hitRegion = v.isRegion ? h('div', { key: 'hitRegion', css: 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;' },
        h('div', {}, v.pins.map(function (p) {
          return h('button', {
            key: 'ph' + p.id, onClick: p.onTap,
            attrs: { type: 'button', title: p.name, 'aria-label': p.name },
            css: 'position:absolute;transform:translate(-50%,-100%);width:46px;height:50px;border-radius:24px;pointer-events:auto;cursor:pointer;background:transparent;border:0;padding:0;',
            style: { left: p.sx + 'px', top: p.sy + 'px' }
          });
        })),
        v.hasLabels ? h('div', { key: 'labels', css: 'position:absolute;left:0;top:0;width:100%;height:100%;' },
          h('div', {}, v.labels.map(function (l) {
            return h('div', {
              key: 'lc' + l.id,
              css: 'position:absolute;left:0;top:0;transform-origin:0 0;height:2px;background:rgba(110,86,54,.55);border-radius:1px;',
              style: { transform: 'translate(' + l.lx + 'px,' + l.ly + 'px) rotate(' + l.ang + 'deg)', width: l.len + 'px', opacity: l.op }
            });
          })),
          h('div', {}, v.labels.map(function (l) {
            return h('button', {
              key: 'lb' + l.id, cls: 'nm-label', onClick: l.onTap, attrs: { type: 'button' },
              css: 'position:absolute;transform:translate(-50%,-50%);width:max-content;max-width:132px;background:#fffaf0;border:2px solid #cbb392;border-radius:11px;padding:2px 8px 3px;font-size:10px;font-weight:800;line-height:1.4;text-align:center;color:#4a3a2a;box-shadow:0 3px 0 #cdb28d;pointer-events:auto;cursor:pointer;font-family:inherit;',
              style: { left: l.x + 'px', top: l.y + 'px', opacity: l.op }
            }, l.name);
          }))
        ) : null,
        v.isNumbered ? h('div', { key: 'numbered', css: 'position:absolute;left:0;top:0;width:100%;height:100%;' },
          h('div', {}, v.labels.map(function (l) {
            return h('button', {
              key: 'nb' + l.id, onClick: l.onTap, attrs: { type: 'button' },
              css: "position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:#d0663c;border:2px solid #fffaf0;color:#fff6e6;font-family:'Zen Maru Gothic',serif;font-weight:900;font-size:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 0 #a8462a;pointer-events:auto;cursor:pointer;padding:0;",
              style: { left: l.px + 'px', top: l.py + 'px', opacity: l.op }
            }, String(l.num));
          })),
          h('div', { css: 'position:absolute;right:10px;top:52px;bottom:10px;width:196px;background:rgba(255,250,240,.95);border:2px solid #cbb392;border-radius:16px;padding:8px 6px 8px 8px;overflow:auto;pointer-events:auto;box-shadow:0 4px 0 rgba(180,150,110,.4);' },
            v.legend.map(function (g) {
              return h('button', {
                key: 'lg' + g.id, cls: 'nm-legend', onClick: g.onTap, attrs: { type: 'button' },
                css: 'display:flex;gap:7px;align-items:flex-start;width:100%;text-align:left;border:0;background:transparent;padding:4px 2px;cursor:pointer;font-family:inherit;color:#4a3a2a;'
              },
                h('span', { css: 'flex:none;width:19px;height:19px;border-radius:50%;background:#d0663c;color:#fff6e6;font-weight:900;font-size:11px;display:flex;align-items:center;justify-content:center;' }, String(g.num)),
                h('span', { css: 'min-width:0;' },
                  h('span', { css: 'display:block;font-size:11px;font-weight:800;line-height:1.35;' }, g.name),
                  h('span', { css: 'display:block;font-size:9.5px;color:#a8906e;' }, g.area)
                )
              );
            })
          )
        ) : null
      ) : null;

      var modeBar = v.isRegion ? h('div', { key: 'modeBar', css: 'position:absolute;left:14px;bottom:12px;display:flex;gap:5px;background:rgba(255,250,240,.94);border:2px solid #cbb392;border-radius:999px;padding:4px;box-shadow:0 4px 0 rgba(180,150,110,.4);' },
        [{ id: 'callout', label: '引き出し' }, { id: 'columns', label: '左右に整列' }, { id: 'numbered', label: '番号＋凡例' }, { id: 'bare', label: 'ピンだけ' }].map(function (m) {
          var on = cmp.state.lmode === m.id;
          return h('button', {
            key: 'm' + m.id, attrs: { type: 'button' },
            onClick: function () { cmp.setState({ lmode: m.id }); },
            css: 'border:0;border-radius:999px;padding:5px 11px;font-family:inherit;font-size:11px;font-weight:800;cursor:pointer;',
            style: { background: on ? '#d0663c' : 'transparent', color: on ? '#fff6e6' : '#8a7358' }
          }, m.label);
        })
      ) : null;

      var topBar = h('div', { key: 'topBar', css: 'position:absolute;left:16px;top:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:calc(100% - 32px);' },
        v.isRegion ? h('button', {
          key: 'back', cls: 'nm-back', onClick: v.onBack, attrs: { type: 'button' },
          css: "border:3px solid #cbb392;background:#fffaf0;color:#4a3a2a;font-family:'Zen Maru Gothic',serif;font-weight:700;font-size:13px;padding:7px 15px;border-radius:999px;cursor:pointer;box-shadow:0 4px 0 #cdb28d;"
        }, '← 日本ぜんぶ') : null,
        h('div', { css: 'background:rgba(255,250,240,.92);border-radius:999px;padding:7px 15px;font-size:13px;font-weight:800;color:#4a3a2a;box-shadow:0 4px 0 rgba(180,150,110,.35);' },
          v.regionName + ' ',
          h('span', { css: 'font-weight:500;color:#8a7358;font-size:11px;' }, v.regionBlurb))
      );

      var combo = v.comboOn ? h('div', {
        key: 'combo',
        css: "position:absolute;right:16px;top:14px;background:#d0663c;color:#fff6e6;border-radius:999px;padding:6px 14px;font-family:'Zen Maru Gothic',serif;font-weight:900;font-size:14px;box-shadow:0 4px 0 #a8462a;animation:gkPop .3s ease-out;"
      }, v.combo + ' コンボ！') : null;

      var noPins = v.noPins ? h('div', {
        key: 'nopins',
        css: 'position:absolute;left:50%;bottom:24px;transform:translateX(-50%);background:#fffaf0;border:3px solid #cbb392;border-radius:18px;padding:12px 20px;text-align:center;box-shadow:0 6px 0 #cdb28d;'
      },
        h('div', { css: "font-family:'Zen Maru Gothic',serif;font-weight:700;font-size:14px;" }, 'このあたりはまだ調査中だよ'),
        h('a', { attrs: { href: './contact/' }, css: 'font-size:11px;color:#8a7358;margin-top:3px;display:block;' }, '知ってるお店があったら教えてね')
      ) : null;

      var detail = v.hasSelected ? shopCard(v) : null;

      var particles = h('div', { key: 'particles', css: 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;' },
        v.parts.map(function (p) {
          return h('span', {
            key: 'pt' + p.id,
            css: 'position:absolute;pointer-events:none;z-index:60;animation:gkPart .85s cubic-bezier(.18,.9,.3,1) forwards;',
            style: {
              left: p.x + 'px', top: p.y + 'px', width: p.size + 'px', height: p.size + 'px',
              'margin-left': (-p.size / 2) + 'px', 'margin-top': (-p.size / 2) + 'px',
              background: p.color, 'border-radius': p.shape === 'square' ? '2px' : '50%',
              '--gkdx': p.dx + 'px', '--gkdy': p.dy + 'px', '--gkrot': p.rot + 'deg'
            }
          });
        })
      );

      var stage = h('div', {
        ref: v.stageRef,
        css: 'flex:3 1 400px;position:relative;overflow:hidden;border-radius:30px;height:clamp(420px,62vh,700px);background:linear-gradient(180deg,#cfe6ec 0%,#bcd9e4 55%,#a9cdda 100%);border:4px solid #fffaf0;box-shadow:0 14px 0 #d5bd9c,0 26px 40px rgba(90,64,36,.24),inset 0 -18px 40px rgba(60,90,110,.18);perspective:1200px;perspective-origin:50% 42%;'
      }, board, hitJapan, hitRegion, modeBar, topBar, combo, noPins, detail, particles);

      /* ---- お店リスト（order:-1 ＝ 左） ---- */
      var list = h('div', { css: 'order:-1;flex:1 1 272px;min-width:250px;display:flex;flex-direction:column;background:#fffaf0;border:4px solid #cbb392;border-radius:26px;padding:14px;box-shadow:0 10px 0 #d5bd9c,0 18px 30px rgba(90,64,36,.2);max-height:clamp(420px,62vh,700px);' },
        h('div', { css: 'display:flex;align-items:center;gap:8px;padding-bottom:10px;border-bottom:2px dashed #e4d3b6;' },
          img(A + 'garlic-sm.svg', 'width:25px;height:25.8px;flex:none;display:block;'),
          h('div', { css: "font-family:'Zen Maru Gothic',serif;font-weight:900;font-size:15px;" }, 'お店リスト'),
          h('div', { css: 'margin-left:auto;font-size:11px;color:#a8906e;' }, v.listCount + ' 軒')
        ),
        h('div', { css: 'flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:6px;padding-top:10px;' },
          v.listItems.length ? v.listItems.map(function (s) {
            return h('button', {
              key: 'li' + s.id, cls: 'nm-listitem', onClick: s.onTap, attrs: { type: 'button' },
              css: 'display:flex;gap:9px;align-items:flex-start;text-align:left;width:100%;border:2px solid #eadcc2;border-radius:16px;padding:9px 11px;cursor:pointer;font-family:inherit;color:#4a3a2a;box-shadow:0 3px 0 #eadcc2;',
              style: { background: s.active ? '#fff3dc' : '#fffdf7' }
            },
              h('span', { css: 'position:relative;width:26px;height:27px;flex:none;margin-top:1px;display:block;' },
                img(A + 'garlic-sm.svg', 'position:absolute;left:0;top:0;width:100%;height:100%;'),
                h('span', { css: 'position:absolute;left:50%;bottom:-4px;transform:translateX(-50%);background:#fffaf0;border:1px solid #e2cfae;border-radius:999px;padding:0 3px;font-size:7px;font-weight:800;color:#c0562f;letter-spacing:-1px;line-height:1.6;white-space:nowrap;' }, s.starsOn)
              ),
              h('span', { css: 'min-width:0;flex:1;' },
                h('span', { css: 'display:block;font-size:12.5px;font-weight:800;line-height:1.35;' }, s.name),
                h('span', { css: 'display:block;font-size:10.5px;color:#a8906e;margin-top:2px;' }, s.area),
                h('span', { css: 'display:block;font-size:11px;color:#8a7358;margin-top:3px;' }, s.menu)
              )
            );
          }) : h('div', { css: 'font-size:12px;color:#a8906e;line-height:1.8;padding:10px 4px;' }, '条件に合うお店が見つかりませんでした。絞り込みを解除してみてね。')
        ),
        h('div', { css: 'padding-top:10px;border-top:2px dashed #e4d3b6;font-size:10.5px;color:#a8906e;line-height:1.6;' }, 'リストをタップすると、その地域にズームしてお店が開くよ')
      );

      var mapRow = h('div', { css: 'display:flex;gap:14px;flex-wrap:wrap;align-items:stretch;' }, stage, list);

      var footRow = h('div', { css: 'display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:11px;color:#a8906e;' },
        h('div', {}, '地図をタップ → 地域にズーム → ピンをタップでお店の詳細が出るよ'),
        h('div', {}, v.matchedCount + ' / ' + v.total + ' 軒を表示中')
      );

      var main = h('div', { css: 'position:relative;flex:6 1 640px;max-width:1080px;display:flex;flex-direction:column;gap:12px;' },
        header, chips, mapRow, footRow);

      /* 装飾のにんにく影は自前のクリップ層に入れる（ルートに overflow:hidden を掛けるとページが縦にスクロールできなくなるため） */
      var decor = h('div', { css: 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0;' },
        h('div', { css: 'position:absolute;right:-40px;top:-30px;width:190px;height:200px;opacity:.16;' },
          img(A + 'garlic-shadow.svg', 'position:absolute;inset:0;width:100%;height:100%;')),
        h('div', { css: 'position:absolute;left:-50px;bottom:-60px;width:230px;height:240px;opacity:.12;' },
          img(A + 'garlic-shadow.svg', 'position:absolute;inset:0;width:100%;height:100%;transform:scaleX(-1);'))
      );

      return h('div', { css: 'position:relative;display:flex;flex-wrap:wrap;gap:16px;padding:16px;justify-content:center;align-items:flex-start;' },
        decor, main, adRow);
    }

    /* ---- お店の詳細カード ---- */
    function shopCard(v) {
      var s = v.selected;
      /* 外部送客は必ず AFF.decorate() を通す（単一チョークポイント）。
         未提携なら素通し＝素のリンクとして出る。装飾された場合だけ rel="sponsored" と「広告」表示が付く
         （景表法5条3号・ステマ規制）。 */
      var links = [];
      if (s.tabelog_url) links.push({ svc: 'tabelog', href: s.tabelog_url, label: '食べログで見る' });
      else if (s.official_url) links.push({ svc: 'official', href: s.official_url, label: '公式サイト' });

      return h('div', {
        key: 'detail',
        css: 'position:absolute;left:0;right:0;top:56px;bottom:0;padding:12px;display:flex;align-items:flex-end;animation:gkPop .46s cubic-bezier(.22,1.4,.36,1);pointer-events:none;'
      },
        h('div', { cls: 'nm-detail-card', css: 'width:100%;overflow:auto;pointer-events:auto;background:#fffaf0;border:4px solid #cbb392;border-radius:26px;padding:16px 18px;box-shadow:0 10px 0 #d5bd9c,0 20px 34px rgba(70,50,30,.3);display:flex;gap:16px;flex-wrap:wrap;' },
          h('div', { css: 'flex:1 1 220px;min-width:0;' },
            h('div', { css: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' },
              h('span', { css: 'background:#d0663c;color:#fff6e6;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:800;' }, s.lv.label),
              h('span', { css: 'display:flex;align-items:center;gap:3px;' },
                img(A + 'garlic-sm-orange.svg', 'width:19px;height:19.6px;flex:none;display:block;'),
                s.g2 ? img(A + 'garlic-sm-orange.svg', 'width:19px;height:19.6px;flex:none;display:block;') : null,
                s.g3 ? img(A + 'garlic-sm-orange.svg', 'width:19px;height:19.6px;flex:none;display:block;') : null
              )
            ),
            h('div', { css: "font-family:'Zen Maru Gothic',serif;font-weight:900;font-size:21px;line-height:1.25;margin-top:7px;color:#4a3a2a;" }, s.name),
            h('div', { css: 'font-size:12px;color:#8a7358;margin-top:3px;' }, s.area),
            h('div', { css: 'font-size:11px;color:#a8906e;margin-top:8px;line-height:1.6;' }, s.lv.desc),
            h('div', { css: 'display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:12px;line-height:1.7;' },
              h('div', {}, h('span', { css: 'color:#a8906e;' }, 'あいてる時間'), h('br', {}), s.hours || '要確認',
                s.closed_days ? [h('br', { key: 'br2' }), h('span', { key: 'cd', css: 'color:#a8906e;' }, '休み：'), s.closed_days] : null),
              h('div', {}, h('span', { css: 'color:#a8906e;' }, 'ばしょ'), h('br', {}), s.addr)
            ),
            h('div', { css: 'margin-top:12px;padding:10px 12px;background:#fdf3e2;border-radius:14px;' },
              h('div', { css: 'font-size:12px;line-height:1.75;color:#6b5540;text-wrap:pretty;' }, s.review),
              s.sources && s.sources.length ? h('div', { css: 'font-size:10px;color:#a8906e;margin-top:7px;' },
                '出典：', h('a', { attrs: { href: s.sources[0], target: '_blank', rel: 'noopener nofollow' }, css: 'color:#c0562f;' }, hostOf(s.sources[0]))
              ) : null
            ),
            h('div', { css: 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;align-items:center;' },
              h('a', { attrs: { href: s.mapUrl, target: '_blank', rel: 'noopener' }, css: 'background:#d0663c;color:#fff6e6;border-radius:999px;padding:9px 16px;font-size:12px;font-weight:800;box-shadow:0 4px 0 #a8462a;text-decoration:none;' }, '地図アプリでひらく'),
              links.map(function (l, i) {
                var sponsored = AFF.isAffiliated(l.svc);
                return h('a', {
                  key: 'ln' + i,
                  attrs: { href: AFF.decorate(l.svc, l.href), target: '_blank', rel: AFF.relFor(l.svc) },
                  css: 'border:2px solid #cbb392;background:#fffaf0;color:#7a6448;font-size:12px;font-weight:800;padding:9px 16px;border-radius:999px;box-shadow:0 4px 0 #ddc7a6;text-decoration:none;'
                }, l.label + (sponsored ? '［広告］' : ''));
              }),
              h('button', { onClick: v.onClose, attrs: { type: 'button' }, css: 'border:0;background:transparent;color:#a8906e;font-family:inherit;font-size:12px;padding:9px 6px;cursor:pointer;' }, 'とじる')
            )
          ),
          h('div', { css: 'flex:0 1 200px;min-width:150px;display:flex;flex-direction:column;gap:8px;' },
            h('div', { css: 'aspect-ratio:4/3;border-radius:16px;background:repeating-linear-gradient(135deg,#ecdfc6 0 9px,#f6ecd8 9px 18px);display:flex;align-items:center;justify-content:center;border:2px solid #e0cfae;' },
              img(A + 'garlic.svg', 'width:54px;height:55.7px;display:block;opacity:.55;animation:gkTilt 6s ease-in-out infinite;')),
            h('div', { css: 'background:#fff2e4;border-radius:14px;padding:10px 12px;' },
              h('div', { css: 'font-size:10px;color:#c0906a;' }, '看板メニュー'),
              h('div', { css: "font-family:'Zen Maru Gothic',serif;font-weight:700;font-size:14px;margin-top:2px;line-height:1.4;" }, s.menu),
              s.price ? h('div', { css: 'font-size:12px;color:#d0663c;font-weight:800;margin-top:4px;' }, s.price) : null
            )
          )
        )
      );
    }

    function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return 'リンク'; } }

    var root = document.getElementById('nm-app');
    cmp._render = mount(root, view);
    cmp._render();

    window.GK.spring(cmp, 780);
    window.GK.countUp(cmp, 'counter', window.GK.SHOPS.length, 900);

    /* URLハッシュ（#/area/kanto, #/shop/s01）で状態を復元・共有できるようにする */
    function applyHash() {
      var m = /^#\/area\/([a-z]+)$/.exec(location.hash);
      var ms = /^#\/shop\/([a-z0-9]+)$/i.exec(location.hash);
      if (ms) {
        var sh = window.GK.SHOPS.filter(function (x) { return x.id === ms[1]; })[0];
        if (sh) { cmp.setState({ view: 'region', region: sh.region, shop: sh.id, landed: true, enter: 1 }); return; }
      }
      if (m) { cmp.setState({ view: 'region', region: m[1], shop: null, landed: true, enter: 1 }); return; }
      if (location.hash === '' || location.hash === '#/') cmp.setState({ view: 'japan', region: null, shop: null });
    }
    applyHash();
    window.addEventListener('hashchange', applyHash);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', App);
  else App();
})();
