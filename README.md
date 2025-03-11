# Next Clinical Reagent Manager

臨床検査試薬管理システム

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
