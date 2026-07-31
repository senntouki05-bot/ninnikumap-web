/* にんにくマップ — 地図エンジン（claude design「案2c-リスト左・広告下」の garlic-core.js を移植）
   ・日本地図: Natural Earth (world-atlas 2.0.2) をメルカトル投影 → 600x900 の低ポリ化パス
   ・店舗データは window.NM_DATA（data.js）から読む。座標は国土地理院ジオコーディングAPIで取得した実測値。
   ・オリジナルとの差分: React依存の partNodes を削除（描画は app.js のvdomが担当）、
     未使用の LANDMARKS を削除、SHOPS/REGIONS を外部データ化。ロジックは変更していない。
*/
(function () {
  var K = 1479.5338384900026, TX = -3179.7828701446533, TY = 1434.4880423864438;
  var W = 600, H = 900;

  var PATHS = [
    "M467.1,259L473,257.9L472.3,281.2L473.1,285L481.8,295.9L486.8,312.8L486.4,324.9L484.5,335.5L478.3,340L475.4,347.1L473.3,358.9L464,361.1L460.2,367.3L459.4,373.8L462.2,389.6L461.2,401L454.3,413.4L450.2,429.5L451.5,435L458,445.7L451.9,447.7L447.2,452.4L444.6,462.9L436.9,467.4L433.4,471.8L430.2,470L430.9,459.2L437.9,450.1L433.1,447.4L431.1,447.8L429.4,452.9L426.4,455.6L428.8,460.6L427,463.9L421.8,459.2L416.1,459.8L413.7,462L411.8,473.7L407,480.3L403.4,478L404.4,469.4L407,467.8L402.3,464.7L398.7,465.9L388.6,481.3L372,479.2L359.5,481.7L365.4,477.9L365,475.7L358.8,476L356.9,473.8L355.6,477.8L354.2,469.2L355.3,467.5L352.8,467L350,469.1L345.9,478.7L354.8,486.4L354.2,489.8L340.7,494.4L330,513.6L324.2,515.9L318,513.8L309.6,499.7L308.9,490.9L314.3,486.9L317.1,480.6L307.4,480.2L299.6,476L286.8,477.6L279.7,483.4L266.1,486.4L258.3,490.5L255.1,489.6L245.8,492.2L239.7,488.9L236.9,489.8L232.6,504.9L222.1,498.3L209,501.5L204.9,499.3L200.9,500.7L200.1,491.7L203.1,487.7L212.1,487L235.5,467.9L246.9,455.4L252.6,452.4L261.6,451L264.3,454.1L280,452.6L310.8,444.9L313.2,445.7L312.3,449.9L314.7,452L323.8,452.7L329.6,449.4L334.5,444.3L332.3,437.2L333.9,433.2L350.2,413.1L350.7,398.3L353.9,392.4L366.2,387.8L366.6,390.6L355.4,400.9L357.8,403.9L358.3,410L364.3,412.7L366.8,412.1L371.2,406.3L392,397.7L400.1,389.4L406.6,377.3L416,371.9L420,367.5L423,355.7L430.3,343.1L436.3,325.5L437.1,318.3L435.3,310.6L428.7,308.4L433,305L435.7,296.9L433.4,287.6L434.6,282.9L442.7,277.1L444.2,271.6L443.6,266.3L445.3,263.9L451.6,265.1L453,275.4L454.7,277.6L458,274.2L464.3,275.8L466,274.4L468,268.3L466.4,263.5L456,267L458.5,255.3L463.9,256.1Z",
    "M534.1,162.4L541.3,163L551.1,168.5L557.2,169.2L561.2,167.3L574.1,154.9L567.8,171.4L568.2,178.7L573.4,191.6L577.1,192.4L581.9,188.5L586,188.6L577.5,196.1L573.5,196L562.5,202.2L555,204.1L543.8,203.2L537.9,206.4L527.9,216.4L524,222.7L519,237.3L500.2,228.3L483.2,217.1L471.7,218.2L460.9,225.4L453.7,217.9L447.8,217.8L444.4,222.1L443.9,227.1L449.1,232.7L454.4,233.3L465.1,244.1L461.2,246.4L452.4,243.7L445.3,254L437.6,256.9L435.3,252L438.2,240.3L436.9,235L431.1,227.6L431.8,217L432.6,214.6L438.4,211.7L446.6,203.9L448,200.5L445.6,196.3L445.5,191.5L448,190.3L455.6,194.7L464.8,195.9L468.9,195.2L470.9,192.4L471.5,179.5L477.9,166L478.3,157.2L480.9,149.3L481.4,140.8L476.3,124.8L478.4,115.8L485.4,111.8L509.9,142.5L532.5,161.9Z",
    "M207.5,512.3L212.5,513.2L218.1,510.7L220.9,512.3L221.3,515.4L216.8,522.4L226.1,523.1L224.9,527.2L227.5,529.4L226.5,531.7L229,533.4L220,547.3L211.7,579.6L204.9,578.6L203.9,580.4L205.5,584.1L194.9,591.4L197.6,583.7L195.4,574.4L197.7,573L197.2,570.4L194.1,570.1L191.6,574.8L191.1,579.6L193.8,583.7L192.4,586.4L182.4,583L181,579.5L184.8,578.2L185.5,573.6L182,568.5L182.2,558.8L187.4,554.8L193.7,542.6L190.1,541.4L191.8,539.1L191.3,536.1L187,528.1L183.3,525.4L180.4,527.7L181.7,535.5L185.6,535.4L186,540.1L183.5,540.8L178.5,537.9L171.2,544.1L172.7,539.3L169.2,534.7L168.9,529.1L172.8,534.2L177,535.5L174.5,530.2L166.4,523.6L167.1,520.3L173.2,521L172.7,517.4L186.6,511.3L189.7,505.1L194.4,502.6L201.8,503.9L204.5,510.1Z",
    "M289.7,491.9L296.9,492.9L297.9,504.7L299.6,505.5L290.2,512.1L285.2,523.3L279.4,517.1L270.9,515.1L262,519.8L254,535.7L249.6,538.5L245.4,538.2L247.2,533.9L241.6,533.5L239.9,529.1L242,521.8L239.2,520.7L239.4,517.6L229.7,520.4L245.4,509.6L249.1,500.2L253,496.9L258.1,502.2L266.9,500.8L270.9,497.8L270.2,492.3L279.1,489.1L286.1,490Z",
    "M132.2,720L122.1,726.1L123,729.3L120.1,731.4L120.4,734.4L116.5,736.1L118.5,726.3L124.2,721.7L123.1,718.8L128.1,719.6L132.2,713.3L134.1,715.4L133.6,718Z",
    "M392.6,378L389.6,377.8L392.1,373.2L390.1,372.4L390.2,369.6L396.7,361.8L395.4,369.7L398.6,370L396.5,375.3Z",
    "M163,674.7L160.8,677.1L155.6,673.5L169.2,665.6L169.7,668.1L162.6,673.4Z",
    "M304.5,490.9L301.7,493.6L299.3,493.4L297.7,490.8L302,485.2L306.4,482.9L303.9,487.5Z",
    "M179.3,554.5L177.2,555.6L176.1,554.1L177.6,552.6L177.4,545.6L181.5,545L182.4,551.1Z",
    "M161.3,488.9L160.8,490.4L158.3,488.4L159.8,480.9L163,478.5L163.7,483.1L161.2,486.9Z",
    "M193.2,613.9L188.7,613.9L187.2,610.2L190,607.9L194.5,610.8Z",
    "M142.8,537.6L147.2,538.2L148.6,541.6L144.9,543.6L142.3,541.3Z",
    "M202,609.9L199.7,610.2L199.6,608.5L204.6,597L202.8,605.9Z",
    "M158.6,496.1L156.9,497.3L156.1,495.4L156.9,489.9L160,491L160,492.7Z",
    "M153.4,535.8L151.3,532.4L154.2,526.8L156,531.1L154.2,533.1Z",
    "M264.2,430.4L260.8,431.2L259.5,429.4L262.3,426L264.4,429Z"
  ];

  function project(lat, lon) {
    return {
      x: TX + K * lon * Math.PI / 180,
      y: TY - K * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))
    };
  }

  var POLYS = PATHS.map(function (d) {
    return d.replace(/[MZ]/g, '').split('L').map(function (p) { var a = p.split(','); return [parseFloat(a[0]), parseFloat(a[1])]; });
  });

  function smoothPath(pts) {
    if (!pts || pts.length < 3) return '';
    var s0 = ((pts[0][0] + pts[pts.length - 1][0]) / 2), s1 = ((pts[0][1] + pts[pts.length - 1][1]) / 2);
    var d = 'M' + s0.toFixed(1) + ',' + s1.toFixed(1);
    for (var i = 0; i < pts.length; i++) {
      var c = pts[i], n = pts[(i + 1) % pts.length];
      d += 'Q' + c[0].toFixed(1) + ',' + c[1].toFixed(1) + ' ' + ((c[0] + n[0]) / 2).toFixed(1) + ',' + ((c[1] + n[1]) / 2).toFixed(1);
    }
    return d + 'Z';
  }
  var PATHS_SMOOTH = POLYS.map(smoothPath);

  var DATA = window.NM_DATA || { shops: [], regions: [] };
  var REGIONS = DATA.regions;
  var SHOPS = DATA.shops;

  var GENRES = [
    { id: 'all', label: 'ぜんぶ' },
    { id: 'steak', label: 'ステーキ・肉' },
    { id: 'ramen', label: 'ラーメン' },
    { id: 'bar', label: 'バル・イタリアン' },
    { id: 'izakaya', label: '居酒屋' },
    { id: 'chuka', label: '中華・アジア' },
    { id: 'shop', label: 'カフェ・物販' }
  ];

  SHOPS.forEach(function (s) { var p = project(s.lat, s.lon); s.x = Math.round(p.x * 10) / 10; s.y = Math.round(p.y * 10) / 10; });
  REGIONS.forEach(function (r) {
    var p = project(r.lat, r.lon);
    r.x = Math.round(p.x * 10) / 10; r.y = Math.round(p.y * 10) / 10;
    r.shops = SHOPS.filter(function (s) { return s.region === r.id; });
    r.count = r.shops.length;
  });

  /* level: 3 = にんにく100%の専門店 / 2 = にんにく推しの店 / 1 = 名物にんにく料理がある店 */
  var LEVELS = {
    3: { label: 'にんにく100%', short: '専門', desc: 'メニューのほぼ全部がにんにく料理。にんにくを食べに行く店。', stars: 3 },
    2: { label: 'にんにく推し', short: '推し', desc: '専門店ではないけど、にんにく料理が主役級で選べる店。', stars: 2 },
    1: { label: '名物あり', short: '名物', desc: '普通のお店だけど、名物のにんにく料理が有名。', stars: 1 }
  };

  /* ---- 効果音（WebAudio・コンボでピッチ上昇） ---- */
  var actx = null, combo = 0, comboAt = 0;
  function tone(freq, dur, type, gain) {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'triangle'; o.frequency.value = freq;
      g.gain.value = 0; o.connect(g); g.connect(actx.destination);
      var t = actx.currentTime;
      g.gain.linearRampToValueAtTime(gain == null ? 0.07 : gain, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { }
  }
  var muted = false;
  function sfx(kind, opt) {
    opt = opt || {};
    if (muted || opt.mute) return 0;
    var wave = opt.wave || 'triangle';
    var now = performance.now();
    if (now - comboAt < 1400) { combo = Math.min(combo + 1, 7); } else { combo = 0; }
    comboAt = now;
    var semi = Math.pow(2, combo / 12);
    if (kind === 'pin') { tone(523 * semi, 0.16, wave); tone(784 * semi, 0.1, wave, 0.04); }
    else if (kind === 'zoom') { tone(330, 0.09, wave, 0.05); setTimeout(function () { tone(494, 0.18, wave, 0.06); }, 70); }
    else if (kind === 'land') { tone(110, 0.28, 'sine', 0.12); tone(165, 0.12, wave, 0.04); }
    else if (kind === 'open') { tone(659, 0.12, wave, 0.05); setTimeout(function () { tone(880, 0.22, wave, 0.06); }, 90); }
    else if (kind === 'back') { tone(392, 0.1, wave, 0.05); setTimeout(function () { tone(294, 0.16, wave, 0.05); }, 60); }
    else if (kind === 'tick') { tone(1046, 0.05, wave, 0.03); }
    return combo;
  }
  function setMuted(v) { muted = !!v; }
  function isMuted() { return muted; }
  function haptic(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 12); } catch (e) { } }

  /* ---- ドスン用シェイク（refに直接当てる） ---- */
  function shake(el, name) {
    if (!el) return;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = (name || 'gkShake') + ' .34s cubic-bezier(.36,.07,.19,.97)';
  }

  /* ---- 数字カウントアップ ---- */
  function countUp(cmp, key, target, ms) {
    var from = (cmp.state && cmp.state[key]) || 0, t0 = performance.now();
    if (cmp._cu && cmp._cu[key]) cancelAnimationFrame(cmp._cu[key]);
    cmp._cu = cmp._cu || {};
    setTimeout(function () { if (cmp.state[key] !== target) { var s = {}; s[key] = target; cmp.setState(s); } }, (ms || 620) + 500);
    function step(t) {
      var p = Math.min(1, (t - t0) / (ms || 620));
      var e = 1 - Math.pow(1 - p, 3);
      var v = Math.round(from + (target - from) * e);
      var s = {}; s[key] = v; cmp.setState(s);
      if (p < 1) cmp._cu[key] = requestAnimationFrame(step);
    }
    cmp._cu[key] = requestAnimationFrame(step);
  }

  /* ---- オーバーシュート付きの登場スプリング ---- */
  function easeOutBack(p) {
    if (p <= 0) return 0; if (p >= 1) return 1;
    var c = 1.9, q = p - 1;
    return 1 + (c + 1) * q * q * q + c * q * q;
  }
  function spring(cmp, ms) {
    var t0 = performance.now();
    if (cmp._sp) cancelAnimationFrame(cmp._sp);
    if (cmp._spT) clearTimeout(cmp._spT);
    cmp._spT = setTimeout(function () { if ((cmp.state.enter || 0) < 1) cmp.setState({ enter: 1 }); }, (ms || 640) + 500);
    var started = false;
    function step(t) {
      if (!started) { started = true; t0 = t; }
      var p = Math.min(1, (t - t0) / (ms || 640));
      cmp.setState({ enter: p });
      if (p < 1) cmp._sp = requestAnimationFrame(step);
    }
    cmp._sp = requestAnimationFrame(step);
  }

  /* ---- パーティクル（描画は app.js 側。ここでは状態だけ持つ） ---- */
  var pid = 0;
  function burst(cmp, x, y, opt) {
    opt = opt || {};
    var n = opt.count || 10, list = [];
    for (var i = 0; i < n; i++) {
      var a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      var d = (opt.dist || 60) * (0.5 + Math.random() * 0.8);
      list.push({
        id: ++pid, x: x, y: y,
        dx: Math.cos(a) * d, dy: Math.sin(a) * d - (opt.rise || 20),
        size: (opt.size || 9) * (0.6 + Math.random() * 0.9),
        rot: Math.round(Math.random() * 360),
        color: (opt.colors || ['#fff'])[i % (opt.colors || ['#fff']).length],
        shape: opt.shape || 'circle'
      });
    }
    var keep = (cmp.state.parts || []).concat(list);
    cmp.setState({ parts: keep.slice(-70) });
    setTimeout(function () {
      cmp.setState(function (s) {
        var ids = {}; list.forEach(function (p) { ids[p.id] = 1; });
        return { parts: (s.parts || []).filter(function (p) { return !ids[p.id]; }) };
      });
    }, opt.life || 900);
  }

  /* ---- 画面の状態機械 ---- */
  function controller(cmp, opt) {
    opt = opt || {};
    var tilt = opt.tilt == null ? 26 : opt.tilt;
    var rz = opt.rz == null ? -8 : opt.rz;
    var lift = opt.lift == null ? 22 : opt.lift;
    var hold = opt.hold == null ? 420 : opt.hold;
    var wave = opt.wave || 'triangle';

    var api = {
      opt: opt,
      stage: null,
      setStage: function (el) {
        api.stage = el;
        if (!el || api._ro) return;
        var meas = function () {
          var r = el.getBoundingClientRect();
          if (r.width && (r.width !== cmp.state.sw || r.height !== cmp.state.sh)) cmp.setState({ sw: r.width, sh: r.height });
        };
        meas();
        if (window.ResizeObserver) { api._ro = new ResizeObserver(meas); api._ro.observe(el); }
        else window.addEventListener('resize', meas);
      },
      blocks: function () { return []; },
      /* ラベルが画面外にはみ出さないようにピン位置を内側へ寄せる */
      clampToView: function (items, off, b, st, pad) {
        var sw = st.sw || 760, sh = st.sh || 500, s = b.scale;
        var rr = rz * Math.PI / 180, cz = Math.cos(rr), sz = Math.sin(rr);
        var tr = tilt * Math.PI / 180, cxt = Math.cos(tr), sxt = Math.sin(tr);
        var padX = (pad && pad.x) || 96, padT = (pad && pad.t) || 78, padB = (pad && pad.b) || 34;
        return items.map(function (it, i) {
          var o = off[i];
          var vx = s * (it.x + o.ox - b.fx), vy = s * (it.y + o.oy - b.fy);
          var ax = vx * cz - vy * sz, ay = vx * sz + vy * cz;
          var pf = 1200 / (1200 + ay * sxt);
          var px = sw / 2 + ax * pf, py = sh / 2 + ay * cxt * pf;
          var dx = 0, dy = 0;
          if (px < padX) dx = padX - px; else if (px > sw - padX) dx = sw - padX - px;
          if (py < padT) dy = padT - py; else if (py > sh - padB) dy = sh - padB - py;
          if (!dx && !dy) return o;
          var bx = dx / pf, by = (dy / pf) / cxt;
          return { ox: o.ox + (bx * cz + by * sz) / s, oy: o.oy + (-bx * sz + by * cz) / s };
        });
      },
      /* ラベルの実寸を測って、矩形で衝突回避＋画面内に収める */
      labelBox: function (name) {
        api._lb = api._lb || {};
        if (api._lb[name]) return api._lb[name];
        if (!api._ctx) { var c = document.createElement('canvas'); api._ctx = c.getContext('2d'); }
        api._ctx.font = '800 10px "M PLUS Rounded 1c", system-ui, sans-serif';
        var w = api._ctx.measureText(name).width;
        var maxW = 114, lines = Math.max(1, Math.min(3, Math.ceil(w / maxW)));
        var box = { w: Math.min(w, maxW) + 20, h: lines * 14 + 10 };
        api._lb[name] = box;
        return box;
      },
      /* ピンは実位置のまま、店名パネルを画面平面で押し分けて全部読めるようにする */
      projPins: function (items, b, st) {
        var sw = st.sw || 760, sh = st.sh || 500, s = b.scale;
        var rr = rz * Math.PI / 180, cz = Math.cos(rr), sz = Math.sin(rr);
        var tr = tilt * Math.PI / 180, cxt = Math.cos(tr), sxt = Math.sin(tr);
        return items.map(function (it) {
          var vx = s * (it.x - b.fx), vy = s * (it.y - b.fy);
          var ax = vx * cz - vy * sz, ay = vx * sz + vy * cz;
          var pf = 1200 / (1200 + ay * sxt);
          var m = api.labelBox(it.name);
          return { px: sw / 2 + ax * pf, py: sh / 2 + ay * cxt * pf, w: m.w, h: m.h, name: it.name };
        });
      },
      /* 左右の端に整列して引き出す（密集エリアでも絶対に重ならない） */
      labelColumns: function (L, st) {
        var sw = st.sw || 760, sh = st.sh || 500;
        var byX = L.slice().sort(function (a, b2) { return a.px - b2.px; });
        var half = Math.ceil(byX.length / 2);
        var byPy = function (a, b2) { return a.py - b2.py; };
        var left = byX.slice(0, half).sort(byPy), right = byX.slice(half).sort(byPy);
        var lay = function (arr, side) {
          if (!arr.length) return;
          var bot = side < 0 ? 56 : 16;
          var avail = sh - 54 - bot;
          var sum = arr.reduce(function (t, q) { return t + q.h; }, 0);
          var gap = arr.length > 1 ? Math.max(2, Math.min(7, (avail - sum) / (arr.length - 1))) : 0;
          var hh = sum + gap * (arr.length - 1);
          var top = Math.max(54, Math.min(54 + (avail - hh) / 2, sh - bot - hh));
          var mw = Math.max.apply(null, arr.map(function (q) { return q.w; }));
          arr.forEach(function (q) {
            q.y = Math.round((top + q.h / 2) * 10) / 10;
            q.x = Math.round((side < 0 ? mw / 2 + 12 : sw - mw / 2 - 12) * 10) / 10;
            top += q.h + gap;
          });
        };
        lay(left, -1); lay(right, 1);
        return L;
      },
      labelLayout: function (items, b, st) {
        var sw = st.sw || 760, sh = st.sh || 500;
        var L = api.projPins(items, b, st);
        var pinBox = L.map(function (q) { q.x = q.px; q.y = q.py - 74; return { x: q.px, y: q.py - 18, w: 44, h: 58 }; });
        var ovl = function (ax, ay, aw, ah, bx, by, bw, bh) {
          var ox = Math.min(ax + aw / 2, bx + bw / 2) - Math.max(ax - aw / 2, bx - bw / 2);
          var oy = Math.min(ay + ah / 2, by + bh / 2) - Math.max(ay - ah / 2, by - bh / 2);
          return ox > 0 && oy > 0 ? ox * oy : 0;
        };
        /* 候補位置：真上から扇状に広げていき、空いてる一番近い場所に置く */
        var cands = [];
        for (var ring = 0; ring < 8; ring++) {
          var R = 62 + ring * 24;
          for (var ai = 0; ai < 21; ai++) {
            var step = Math.ceil(ai / 2) * 18 * (ai % 2 ? 1 : -1);
            cands.push({ r: R, a: -90 + step });
          }
        }
        var placed = [];
        L.slice().sort(function (m, n) { return m.py - n.py; }).forEach(function (q) {
          var best = null, bestScore = 1e18;
          for (var i = 0; i < cands.length; i++) {
            var c = cands[i], rad = c.a * Math.PI / 180;
            var x = q.px + Math.cos(rad) * c.r, y = q.py - 14 + Math.sin(rad) * c.r;
            var hw = q.w / 2 + 6, hh = q.h / 2 + 6;
            if (x < hw || x > sw - hw || y < hh + 48 || y > sh - hh) continue;
            if (y + q.h / 2 > sh - 52 && x - q.w / 2 < 336) continue;
            var ov = 0, j;
            for (j = 0; j < placed.length; j++) ov += ovl(x, y, q.w + 8, q.h + 8, placed[j].x, placed[j].y, placed[j].w, placed[j].h);
            for (j = 0; j < pinBox.length; j++) ov += ovl(x, y, q.w + 4, q.h + 4, pinBox[j].x, pinBox[j].y, pinBox[j].w, pinBox[j].h) * 0.55;
            var score = ov * 1000 + c.r + Math.abs(c.a + 90) * 0.6;
            if (score < bestScore) { bestScore = score; best = { x: x, y: y }; }
            if (ov === 0) break;
          }
          if (!best) best = { x: Math.max(q.w / 2 + 6, Math.min(sw - q.w / 2 - 6, q.px)), y: Math.max(q.h / 2 + 54, q.py - 74) };
          q.x = Math.round(best.x * 10) / 10;
          q.y = Math.round(best.y * 10) / 10;
          placed.push({ x: q.x, y: q.y, w: q.w + 8, h: q.h + 8 });
        });
        return L;
      },
      spread: function (items, s, minD) {
        var p = items.map(function (i) { return { x: i.x * s, y: i.y * s, ox: 0, oy: 0 }; });
        for (var it = 0; it < 70; it++) {
          for (var a = 0; a < p.length; a++) for (var b = a + 1; b < p.length; b++) {
            var dx = (p[b].x + p[b].ox) - (p[a].x + p[a].ox), dy = (p[b].y + p[b].oy) - (p[a].y + p[a].oy);
            var d = Math.sqrt(dx * dx + dy * dy) || 0.001;
            if (d < minD) {
              if (d < 0.02) { dx = (a % 2 ? 1 : -1) * 0.6; dy = 0.4; d = 0.72; }
              var f = ((minD - d) / 2) / d;
              p[a].ox -= dx * f; p[a].oy -= dy * f;
              p[b].ox += dx * f; p[b].oy += dy * f;
            }
          }
        }
        return p.map(function (q) { return { ox: q.ox / s, oy: q.oy / s }; });
      },

      matched: function () {
        var f = cmp.state.filter || 'all', q = (cmp.state.q || '').trim();
        return SHOPS.filter(function (s) {
          if (f !== 'all' && f !== s.genre && f !== ('lv' + s.level)) return false;
          if (q && (s.name + s.area + s.menu + s.addr).indexOf(q) < 0) return false;
          return true;
        });
      },

      board: function () {
        var st = cmp.state, sw = st.sw || 760, sh = st.sh || 500;
        var cos = Math.cos(tilt * Math.PI / 180);
        var fit = Math.min(sw / 680, sh / (900 * cos + 60)) * (opt.fit || 1);
        var v = st.view, s = fit, fx = 300, fy = 455;
        if (v !== 'japan') {
          var r = api.region();
          if (r) { s = fit * r.zoom; fx = r.x; fy = r.y; }
        }
        return {
          scale: s, fit: fit, fx: fx, fy: fy,
          tf: 'rotateX(' + tilt + 'deg) rotateZ(' + rz + 'deg) translate(' + (300 - s * fx) + 'px,' + (450 - s * fy) + 'px)'
        };
      },
      region: function () {
        var id = cmp.state.region;
        for (var i = 0; i < REGIONS.length; i++) if (REGIONS[i].id === id) return REGIONS[i];
        return null;
      },
      pinTf: function (x, y, s, z, k) {
        return 'translate(' + (x * s) + 'px,' + (y * s) + 'px) translateZ(' + (z == null ? lift : z) + 'px) scale(' + (k == null ? 1 : k) + ') rotateZ(' + (-rz) + 'deg) rotateX(' + (-tilt) + 'deg)';
      },
      entry: function (i, st) {
        var g = Math.max(0, Math.min(1, ((st.enter == null ? 1 : st.enter) * 1.4) - i * 0.11));
        var e = easeOutBack(g);
        return { z: lift + (1 - e) * 110, k: 0.5 + 0.5 * e, op: g <= 0 ? 0 : 1, e: e };
      },
      shadowTf: function (x, y, s) {
        return 'translate(' + (x * s) + 'px,' + (y * s) + 'px)';
      },

      goRegion: function (id) {
        if (cmp.state.view === 'region' && cmp.state.region === id) return;
        sfx('zoom', { wave: wave }); haptic(14);
        cmp.setState({ view: 'region', region: id, shop: null, pending: null, landed: false });
        setTimeout(function () { spring(cmp, 700); }, 260);
        var r = null; REGIONS.forEach(function (x) { if (x.id === id) r = x; });
        setTimeout(function () {
          sfx('land', { wave: wave }); haptic(24);
          shake(api.stage, opt.shakeName);
          cmp.setState({ landed: true });
          if (r) countUp(cmp, 'counter', r.count, 520);
        }, opt.landDelay == null ? 520 : opt.landDelay);
      },
      goJapan: function () {
        sfx('back', { wave: wave }); haptic(10);
        cmp.setState({ view: 'japan', region: null, shop: null, pending: null, landed: false });
        spring(cmp, 700);
        countUp(cmp, 'counter', SHOPS.length, 620);
      },
      tapShop: function (id, ev) {
        var sh = null; SHOPS.forEach(function (s) { if (s.id === id) sh = s; });
        if (!sh) return;
        var c = sfx('pin', { wave: wave }); haptic(12);
        if (ev && ev.clientX != null && api.stage) {
          var b = api.stage.getBoundingClientRect();
          burst(cmp, ev.clientX - b.left, ev.clientY - b.top, {
            count: 8 + c, colors: opt.partColors || ['#fff3c4', '#f6d365', '#fff'],
            shape: opt.partShape, dist: 54, life: 850, size: opt.partSize || 9
          });
        }
        cmp.setState({ pending: id, combo: c });
        setTimeout(function () {
          if (cmp.state.pending !== id) return;
          sfx('open', { wave: wave });
          cmp.setState({ shop: id, pending: null });
        }, hold);
      },
      closeShop: function () { sfx('back', { wave: wave }); cmp.setState({ shop: null, pending: null }); },
      setFilter: function (id) { sfx('tick', { wave: wave }); cmp.setState({ filter: id, shop: null }); },
      setQ: function (e) { cmp.setState({ q: e.target.value, shop: null }); },

      vals: function () {
        var st = cmp.state, b = api.board(), r = api.region();
        var matched = api.matched();
        var inView = st.view === 'japan' ? [] : matched.filter(function (s) { return s.region === st.region; });
        var off = api.spread(inView, b.scale, opt.minGap || 62);
        off = api.clampToView(inView, off, b, st, { x: 40, t: 60, b: 40 });
        var lsrc = inView.map(function (sp, i) { return { x: sp.x + off[i].ox, y: sp.y + off[i].oy, name: sp.name }; });
        var pxy = api.projPins(lsrc, b, st);
        var pins = inView.map(function (s, i) {
          var en = api.entry(i, st), o = off[i];
          var lx = o.ox, ly = o.oy, ll = Math.sqrt(lx * lx + ly * ly);
          return Object.assign({}, s, {
            tf: api.pinTf(s.x + o.ox, s.y + o.oy, b.scale, en.z, en.k),
            shadowTf: api.shadowTf(s.x, s.y, b.scale),
            leaderTf: 'translate(' + (s.x * b.scale) + 'px,' + (s.y * b.scale) + 'px) rotate(' + (Math.atan2(ly, lx) * 180 / Math.PI) + 'deg)',
            leaderW: ll * b.scale, leaderH: 1.6, hasLeader: ll * b.scale > 14,
            op: en.op, shOp: en.op * 0.5 * en.e,
            sx: Math.round(pxy[i].px * 10) / 10, sy: Math.round(pxy[i].py * 10) / 10,
            pinY: s.y + o.oy,
            delay: (i * 55) + 'ms',
            active: st.shop === s.id,
            pendingNow: st.pending === s.id,
            lv: LEVELS[s.level],
            starsOn: '★★★'.slice(0, s.level),
            starsOff: '☆☆☆'.slice(0, 3 - s.level),
            onTap: function (ev) { api.tapShop(s.id, ev); }
          });
        });
        var lmode = cmp.state.lmode || opt.labelMode || 'callout';
        var lraw = lmode === 'columns' ? api.labelColumns(api.projPins(lsrc, b, st), st)
          : lmode === 'callout' ? api.labelLayout(lsrc, b, st)
            : api.projPins(lsrc, b, st);
        var labels = lraw.map(function (l, i) {
          var ax = l.px, ay = l.py - 44;
          var lx = l.x == null ? ax : l.x, ly = (l.y == null ? ay : l.y) + l.h / 2 - 2;
          var dx = ax - lx, dy = ay - ly;
          return {
            id: inView[i].id, name: l.name, num: i + 1,
            x: Math.round(lx * 10) / 10, y: Math.round((l.y == null ? ay : l.y) * 10) / 10,
            px: Math.round(l.px * 10) / 10, py: Math.round((l.py - 26) * 10) / 10,
            lx: Math.round(lx * 10) / 10, ly: Math.round(ly * 10) / 10,
            len: Math.round(Math.sqrt(dx * dx + dy * dy)), ang: Math.round(Math.atan2(dy, dx) * 180 / Math.PI * 10) / 10,
            op: pins[i].op, active: pins[i].active, onTap: pins[i].onTap
          };
        });
        var legend = labels.map(function (l, i) {
          return { id: l.id, num: l.num, name: l.name, area: inView[i].area, stars: pins[i].starsOn, active: pins[i].active, onTap: pins[i].onTap };
        });
        if (lmode === 'bare') labels = labels.filter(function (l) { return l.active; });
        pins.sort(function (m, n) { return m.pinY - n.pinY; });
        var roff = api.spread(REGIONS, b.scale, opt.minGapRegion || 74);
        roff = api.clampToView(REGIONS, roff, b, st, { x: 72, t: 58, b: 32 });
        var rxy = api.projPins(REGIONS.map(function (rg, i) { return { x: rg.x + roff[i].ox, y: rg.y + roff[i].oy, name: rg.name }; }), b, st);
        var regionPins = REGIONS.map(function (rg, i) {
          var cnt = matched.filter(function (s) { return s.region === rg.id; }).length;
          var en = api.entry(i, st), o = roff[i];
          var rl = Math.sqrt(o.ox * o.ox + o.oy * o.oy);
          return Object.assign({}, rg, {
            tf: api.pinTf(rg.x + o.ox, rg.y + o.oy, b.scale, en.z, en.k),
            shadowTf: api.shadowTf(rg.x, rg.y, b.scale),
            leaderTf: 'translate(' + (rg.x * b.scale) + 'px,' + (rg.y * b.scale) + 'px) rotate(' + (Math.atan2(o.oy, o.ox) * 180 / Math.PI) + 'deg)',
            leaderW: rl * b.scale, leaderH: 1.6, hasLeader: rl * b.scale > 14,
            op: en.op, shOp: en.op * 0.4 * en.e,
            sx: Math.round(rxy[i].px * 10) / 10, sy: Math.round(rxy[i].py * 10) / 10,
            count: cnt, empty: cnt === 0, delay: (i * 70) + 'ms',
            active: st.region === rg.id,
            onTap: function () { api.goRegion(rg.id); }
          });
        });
        var listSrc = st.view === 'japan' ? matched : matched.filter(function (s) { return s.region === st.region; });
        var listItems = listSrc.map(function (s) {
          var rg = null; REGIONS.forEach(function (x) { if (x.id === s.region) rg = x; });
          return Object.assign({}, s, {
            lv: LEVELS[s.level], starsOn: '★★★'.slice(0, s.level), starsOff: '☆☆☆'.slice(0, 3 - s.level),
            regionName: rg ? rg.name : '', active: st.shop === s.id,
            g1: true, g2: s.level >= 2, g3: s.level >= 3,
            onTap: function () {
              if (cmp.state.region !== s.region) {
                api.goRegion(s.region);
                setTimeout(function () { api.tapShop(s.id); }, 860);
              } else api.tapShop(s.id);
            }
          });
        });
        var sel = null;
        SHOPS.forEach(function (s) { if (s.id === st.shop) sel = s; });
        if (sel) {
          sel = Object.assign({}, sel, {
            lv: LEVELS[sel.level], starsOn: '★★★'.slice(0, sel.level), starsOff: '☆☆☆'.slice(0, 3 - sel.level),
            g2: sel.level >= 2, g3: sel.level >= 3,
            pct: sel.level * 33 + 1,
            ratingStars: sel.rating ? '★★★★★'.slice(0, Math.round(sel.rating)) : '',
            mapUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(sel.name + ' ' + (sel.addr || sel.area))
          });
        }
        return {
          geoPaths: PATHS, geoPathsSmooth: PATHS_SMOOTH, regions: REGIONS, boardTf: b.tf, boardScale: b.scale,
          labels: labels, legend: legend,
          isCallout: lmode === 'callout', isColumns: lmode === 'columns',
          isNumbered: lmode === 'numbered', isBare: lmode === 'bare',
          hasLabels: lmode !== 'numbered',
          strokeW: Math.round((1.7 / b.scale) * 1000) / 1000,
          svgW: 600 * b.scale, svgH: 900 * b.scale,
          exTf1: 'translate(0,' + (7 / b.scale) + ')', exTf2: 'translate(0,' + (14 / b.scale) + ')',
          isJapan: st.view === 'japan', isRegion: st.view !== 'japan',
          region: r, regionName: r ? r.name : '日本ぜんぶ', regionBlurb: r ? r.blurb : 'にんにく専門店をさがそう',
          pins: pins, regionPins: regionPins, hasPins: pins.length > 0, noPins: st.view !== 'japan' && pins.length === 0,
          selected: sel, hasSelected: !!sel, pending: !!st.pending,
          counter: st.counter == null ? 0 : st.counter, total: SHOPS.length, matchedCount: matched.length,
          genres: GENRES.map(function (g) {
            return { id: g.id, label: g.label, active: (st.filter || 'all') === g.id, onTap: function () { api.setFilter(g.id); } };
          }),
          levelChips: [3, 2, 1].map(function (n) {
            return { id: 'lv' + n, label: LEVELS[n].label, stars: '★★★'.slice(0, n), active: st.filter === ('lv' + n), onTap: function () { api.setFilter('lv' + n); } };
          }),
          q: st.q || '', onSearch: api.setQ, combo: st.combo || 0, comboOn: (st.combo || 0) > 1,
          listItems: listItems, listCount: listItems.length,
          blocks: api.blocks(st, b),
          onBack: api.goJapan, onClose: api.closeShop, stageRef: api.setStage,
          parts: st.parts || [], landed: !!st.landed
        };
      }
    };
    return api;
  }

  window.GK = {
    PATHS: PATHS, PATHS_SMOOTH: PATHS_SMOOTH, W: W, H: H, SHOPS: SHOPS, REGIONS: REGIONS, GENRES: GENRES, LEVELS: LEVELS,
    project: project, sfx: sfx, setMuted: setMuted, isMuted: isMuted, haptic: haptic, shake: shake,
    countUp: countUp, burst: burst, controller: controller, spring: spring, easeOutBack: easeOutBack
  };
})();
