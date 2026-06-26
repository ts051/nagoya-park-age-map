# 名古屋 公園周辺 年齢層マップ

名古屋市役所のオープンデータを使い、公園の周辺にどの年齢層が多く住んでいるかを地図上で確認する静的 Web アプリです。

## データソース

- 公園: BODIK「【名古屋市】都市公園一覧」。2024年4月1日現在、区別 CSV、更新頻度は年1回。
- 人口: 名古屋市公式「令和8年 町・丁目(大字)別、年齢(10歳階級)別公簿人口(全市・区別)」。2026年6月1日現在の Excel が最新として公開されています。
- ライセンス: Creative Commons Attribution 4.0 International。アプリ上と公開ページで「名古屋市オープンデータカタログサイト、統計なごやweb版」を表示してください。

## ローカル確認

```powershell
cd C:\Users\masam\r_app\nagoya-park-age-map
npm install
npm run validate
npm run dev
```

`npm run dev` 後に表示される URL をブラウザで開きます。`index.html` を直接開いても構いませんが、ブラウザの制限で JSON 読み込みが止まる場合があります。

Node.js が入っていない PC で表示だけ確認する場合は、PowerShell の簡易サーバーを使えます。

```powershell
cd C:\Users\masam\r_app\nagoya-park-age-map
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev-server.ps1 -Port 4180
```

別の PowerShell かブラウザから `http://127.0.0.1:4180/` を開きます。

## 機密情報

API キー、ID、パスワード、トークンはソースコード、`data/*.json`、README に直書きしません。必要になった場合は `.env` または公開先の環境変数・Secrets に保存します。

- `.env` と `.env.*` は `.gitignore` で除外済みです。
- 共有用のキー名だけを `.env.example` に残します。
- GitHub Pages のような静的公開では、ブラウザに渡した値は利用者から見えます。秘密情報が必要な API は、GitHub Actions などの更新処理側でだけ呼び出し、生成済みの公開 JSON だけを配信してください。

## 年度・月次更新

1. `data/source-config.json` の `parksAsOf`、`populationAsOf`、`populationPageUrl` を新年度・最新月のページに更新します。
2. `npm run update:data` を実行します。
3. `npm run validate` で `data/app-data.json` を検証します。

一時的に差し替える場合は環境変数でも指定できます。

```powershell
$env:NAGOYA_POPULATION_PAGE_URL = "https://www.city.nagoya.jp/..."
$env:NAGOYA_POPULATION_AS_OF = "2026-06-01"
npm run update:data
```

公園 CSV には緯度経度がないため、`scripts/update-data.js` は所在地を国土地理院の住所検索 API で座標化し、`data/geocode-cache.json` に保存します。人口 Excel は町丁目の人数を抽出します。町丁目ポリゴンを使う場合は `data/town-boundaries.geojson` を追加し、`app.js` 側で町丁目重心またはポリゴン交差による集計に拡張してください。

## 無料公開

自宅 PC を使わず無料で公開するなら、最初は GitHub Pages が最も単純です。

1. この `nagoya-park-age-map` フォルダを GitHub リポジトリに push します。
2. GitHub の `Settings` から `Pages` を開きます。
3. `Deploy from a branch`、`main`、`/root` を選択します。
4. 数分後に `https://<user>.github.io/<repo>/` で公開されます。

Cloudflare Pages や Netlify でも同じ静的ファイルを無料公開できます。ビルドコマンドは不要で、公開ディレクトリはリポジトリ直下です。
