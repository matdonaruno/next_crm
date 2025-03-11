# バーコードフォーマット仕様

## 対応バーコードタイプ

本システムでは、以下のバーコードタイプに対応しています：

1. **JAN/EAN-13**: 13桁の商品コード（日本ではJANコード）
2. **EAN-14/GTIN-14**: 14桁の商品コード（物流単位）
3. **GS1-128**: 可変長の複合情報を含むバーコード

## GS1-128バーコードの解析

GS1-128バーコードは、複数のデータ要素を含む可変長のバーコードです。各データ要素はAI（Application Identifier）と呼ばれる識別子で始まります。

### 主要なAI（Application Identifier）

| AI | 名称 | 形式 | 説明 |
|----|------|------|------|
| 01 | GTIN | n14 | 商品コード（14桁） |
| 10 | LOT/BATCH | an..20 | ロット番号または製造バッチ番号 |
| 17 | USE BY/EXPIRY | n6 | 有効期限（YYMMDD形式） |
| 21 | SERIAL | an..20 | シリアル番号 |
| 30 | COUNT | n..8 | 数量 |

### 解析アルゴリズム

本システムでは、以下のアルゴリズムでGS1-128バーコードを解析しています：

1. 正規表現パターンを使用して、AIとそれに続くデータを抽出
2. 複数の正規表現パターンを試行し、最も適合するものを採用
3. 抽出したデータを適切なフィールドにマッピング

```typescript
// GS1-128バーコード解析の例
const gs1Regex = /01(\d{14}).*?17(\d{6}).*?10([A-Za-z0-9]+)/;
const match = barcode.match(gs1Regex);

if (match) {
  const gtin = match[1];
  const expiryDate = match[2]; // YYMMDD形式
  const lotNumber = match[3];
  
  // 日付形式の変換（YYMMDD → YYYY-MM-DD）
  const year = parseInt(expiryDate.substring(0, 2));
  const month = expiryDate.substring(2, 4);
  const day = expiryDate.substring(4, 6);
  const fullYear = year + (year >= 50 ? 1900 : 2000);
  const formattedDate = `${fullYear}-${month}-${day}`;
}
```

## バーコードスキャン機能

本システムでは、以下の方法でバーコードスキャンを実現しています：

1. **外部バーコードスキャナー**: キーボードエミュレーションモードのUSBバーコードスキャナー
2. **カメラスキャン**: デバイスのカメラを使用したバーコードスキャン（Web Barcode Detection API）

### カメラスキャンの実装

カメラスキャンは、Web Barcode Detection APIを使用して実装しています。このAPIは、デバイスのカメラを使用してリアルタイムでバーコードを検出します。

```typescript
// バーコード検出の例
const barcodeDetector = new BarcodeDetector({
  formats: ['ean_13', 'ean_8', 'code_128']
});

const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
const videoElement = document.getElementById('video');
videoElement.srcObject = stream;

// 定期的にフレームをキャプチャしてバーコードを検出
setInterval(async () => {
  const barcodes = await barcodeDetector.detect(videoElement);
  if (barcodes.length > 0) {
    const barcode = barcodes[0];
    console.log(`Detected barcode: ${barcode.rawValue} (${barcode.format})`);
    // バーコード検出時の処理
  }
}, 500);
```

## 注意事項

1. GS1-128バーコードの解析は、バーコードの形式によって異なる場合があります。
2. Web Barcode Detection APIは、すべてのブラウザで対応しているわけではありません。
3. バーコードスキャン機能は、デバイスのカメラ性能に依存します。
4. 外部バーコードスキャナーを使用する場合は、キーボードエミュレーションモードに設定してください。 