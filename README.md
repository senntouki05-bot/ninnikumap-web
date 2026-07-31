# にんにくマップ

全国のにんにく専門店・にんにく料理の名店を、地図から探せるサイト。

- **地図UI の正本**: claude design プロジェクト `案2c-リスト左・広告下.dc.html`
  （dcランタイム/Reactは移植せず、`public/app.js` の小さなキー付きvdomで同じDOMを再現している）
- **店舗データの正本**: `data/shops.json`（1軒ずつ一次情報で裏取り済み。`sources` に確認したURL）

## 構成

```
data/
  shops.json          店舗データ（正本。ここだけ直せばよい）
  regions.json        地域9区分（座標・ズーム・キャッチ）
  site.json           サイト名・ドメイン・連絡先
  geocode-cache.json  国土地理院APIの結果キャッシュ
scripts/
  geocode.mjs         住所 → 緯度経度（国土地理院・APIキー不要）
  build.mjs           静的サイト生成（依存ゼロ）
  check.mjs           出荷前チェック（リンク切れ・SEO要素・データ整合）
  e2e.mjs             実ブラウザでの動作/レイアウト確認
  make-images.mjs     OGP画像・アイコンPNGの生成
  serve.mjs           ローカルサーバ（既定 8799）
public/
  core.js             地図エンジン（投影・3D配置・ラベル衝突回避・状態機械）
  app.js              描画層（vdom＋案2cテンプレートの移植）
  styles.css          共通スタイル
  assets/             にんにくSVG・OGP・アイコン
  （それ以外の .html / data.js / sitemap.xml 等はビルド生成物）
```

## 使い方

```bash
npm run geocode   # data/shops.json の住所から座標を埋める・検算する
npm run build     # public/ に静的サイトを生成
npm run check     # 生成物の機械チェック（これが緑でないと出さない）
npm run dev       # http://127.0.0.1:8799/
node scripts/e2e.mjs 8799   # 別ターミナルで。実ブラウザ確認
npm run deploy    # verify（build+check）を通してから Cloudflare Pages へ
```

## 掲載の方針

- にんにくが**店の看板になっている**店だけを載せる。にんにく度は3段階。
  - `level 3` にんにく100%（メニューのほぼ全部がにんにく料理）
  - `level 2` にんにく推し（にんにく料理が主役級で複数選べる）
  - `level 1` 名物あり（一般店だが名物のにんにく料理が知られている）
- 「たまたまガーリックトーストがある」程度の店は載せない。
- **独自の点数・ランキングは付けない。他サイトの評価点も転載しない。**
  （評価データの転載は権利関係が濁るため。載せるのは分類だけ）
- 閉店・移転が確認できた店は載せない。`data/excluded.json` に理由つきで記録を残す。

## 注意（踏んだ罠）

- `aspect-ratio` と `min-height` を併記すると、min-height が比率を通って**幅の下限**に化ける。
  728×90 の広告枠が `88px × 728/90 = 712px` 未満に縮まなくなり、狭い画面で横スクロールが出る。
  元デザインはルートの `overflow:hidden` に隠れていただけで、はみ出し自体は起きていた。
- そのルートの `overflow:hidden` を外さないと、地図の下の本文まで縦スクロールできない。
  装飾のにんにく影は専用のクリップ層に入れて逃がしている。
- `robots.txt` で `/data.js` `/core.js` `/app.js` `/styles.css` を塞がないこと。
  robots.txt はレンダリング時のサブリソース取得にも効くため、塞ぐと Googlebot から見て地図が空になる。
  `scripts/check.mjs` が機械的に検出する。
- 本文中の件数は必ずデータから機械集計する。手で数字を書かない（`check.mjs` が突き合わせる）。
- `import.meta.url` は使わない。パスは `process.cwd()` 固定。

## クレジット

- 日本地図の形状: Natural Earth（パブリックドメイン）を低ポリ化
- 住所の座標: 国土地理院 住所検索API
