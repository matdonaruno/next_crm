# Next Clinical Reagent Manager

臨床検査試薬管理システム

## PWA対応について

このアプリはPWA（Progressive Web App）として実装されており、モバイルデバイスやiPadでホーム画面に追加して利用できます。

### iPad/iOS向けの最適化

iPadやiOS端末で最適に動作するために、以下の対応を行っています：

1. **Apple固有のメタタグ**：
   - `apple-mobile-web-app-capable`
   - `apple-mobile-web-app-status-bar-style`
   - `apple-touch-icon`（各種サイズ）

2. **スプラッシュスクリーン**：
   - 各iPadモデル用のスプラッシュスクリーンを用意
   - 縦向き・横向き両方に対応

3. **マニフェストファイル**：
   - PWA用のマニフェストファイルが `/public/manifest.json` に配置されています
   - 各種アイコンとアプリ情報が含まれています

### PWAアイコンの生成

開発者向け：アイコンを変更する場合は以下の手順でPWAアセットを生成できます：

1. SVGファイルを用意：
   - `/public/icons/app-icon.svg` - 標準アイコン
   - `/public/icons/apple-touch-icon.svg` - Appleデバイス用アイコン
   - `/public/icons/splash-template.svg` - スプラッシュスクリーン

2. 変換スクリプトを実行：
   ```bash
   # セットアップスクリプトを実行
   npm run setup-pwa
   
   # ImageMagickがインストールされていれば、アイコン生成
   npm run generate-pwa-icons
   ```

3. 生成されたアイコンは `/public/icons/` ディレクトリに保存されます

### ホーム画面への追加方法

1. **iPadの場合**：
   - Safariでアプリを開く
   - 共有ボタンをタップ
   - 「ホーム画面に追加」を選択

2. **Androidの場合**：
   - Chromeでアプリを開く
   - メニューから「ホーム画面に追加」を選択

## ダミーJANコードの採番手法

システム内で使用されるダミーJANコードは以下の方法で生成されています：

### 1. プレフィックス: 0999
- 実在しないJANコードの接頭辞として使用
- このプレフィックスで始まるコードは架空のJANコードであることを示す

### 2. シーケンス番号: 10桁の連番
- 1000000から始まる連番を使用
- 各商品に一意のコードを割り当てるため

### 3. チェックディジット: 1桁
- 実際のJANコードと同様の計算方法でチェックディジットを算出
- 奇数桁の数字をそのまま、偶数桁の数字を3倍して合計し、
  その合計を10で割った余りを10から引いた値（10の場合は0）

### 例
0999 + 1000001 + チェックディジット = 09991000001X

### 注意
このコードは実在するJANコードと衝突しないように設計されています。
実際のJANコードは国際的に管理されており、0999で始まるコードは通常割り当てられていません。

## 実装箇所
ダミーJANコードの生成ロジックは `src/app/reagent/register/page.tsx` ファイル内の `fetchProducts` 関数に実装されています。

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
