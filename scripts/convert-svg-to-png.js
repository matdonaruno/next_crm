// SVGをPNGに変換するNodeスクリプト
// 使用方法: node scripts/convert-svg-to-png.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 必要なツールがインストールされているか確認
try {
  execSync('which convert', { stdio: 'ignore' });
  console.log('✅ ImageMagick (convert)が見つかりました');
} catch (error) {
  console.error('❌ ImageMagickがインストールされていません');
  console.error('インストール方法: brew install imagemagick');
  console.error('または: https://imagemagick.org/script/download.php');
  process.exit(1);
}

// 変換するアイコンサイズのリスト
const iconSizes = [16, 32, 72, 96, 128, 144, 152, 167, 180, 192, 384, 512, 1024];

// ディレクトリを作成
const iconDir = path.join(__dirname, '../public/icons');
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

// SVGソースが存在するか確認
const appIconPath = path.join(__dirname, '../public/icons/app-icon.svg');
const appleTouchIconPath = path.join(__dirname, '../public/icons/apple-touch-icon.svg');
const splashTemplatePath = path.join(__dirname, '../public/icons/splash-template.svg');

if (!fs.existsSync(appIconPath)) {
  console.error(`❌ SVGソースが見つかりません: ${appIconPath}`);
  process.exit(1);
}

// 通常アイコンを生成
console.log('🔄 PWAアイコンを生成しています...');
iconSizes.forEach(size => {
  const outputPath = path.join(iconDir, `icon-${size}x${size}.png`);
  try {
    execSync(`convert -background none -size ${size}x${size} ${appIconPath} ${outputPath}`, { stdio: 'ignore' });
    console.log(`✅ 生成しました: ${outputPath}`);
  } catch (error) {
    console.error(`❌ エラー: ${outputPath} の生成に失敗しました`);
  }
});

// Apple Touch Iconを生成
if (fs.existsSync(appleTouchIconPath)) {
  console.log('🔄 Apple Touch Iconを生成しています...');
  [152, 167, 180].forEach(size => {
    const outputPath = path.join(iconDir, `apple-touch-icon-${size}x${size}.png`);
    try {
      execSync(`convert -background none -size ${size}x${size} ${appleTouchIconPath} ${outputPath}`, { stdio: 'ignore' });
      console.log(`✅ 生成しました: ${outputPath}`);
    } catch (error) {
      console.error(`❌ エラー: ${outputPath} の生成に失敗しました`);
    }
  });

  // デフォルトのApple Touch Icon (180x180)
  const defaultAppleTouchIcon = path.join(iconDir, 'apple-touch-icon.png');
  try {
    execSync(`convert -background none -size 180x180 ${appleTouchIconPath} ${defaultAppleTouchIcon}`, { stdio: 'ignore' });
    console.log(`✅ 生成しました: ${defaultAppleTouchIcon}`);
  } catch (error) {
    console.error(`❌ エラー: ${defaultAppleTouchIcon} の生成に失敗しました`);
  }
}

// ファビコンを生成
console.log('🔄 ファビコンを生成しています...');
try {
  const faviconSource = path.join(iconDir, 'favicon.svg');
  if (fs.existsSync(faviconSource)) {
    execSync(`convert -background none -size 16x16 ${faviconSource} ${path.join(iconDir, 'favicon-16x16.png')}`, { stdio: 'ignore' });
    execSync(`convert -background none -size 32x32 ${faviconSource} ${path.join(iconDir, 'favicon-32x32.png')}`, { stdio: 'ignore' });
    execSync(`convert -background none -size 16x16 ${faviconSource} ${path.join(iconDir, 'favicon-16x16.png')} -size 32x32 ${faviconSource} ${path.join(iconDir, 'favicon-32x32.png')} ${path.join(iconDir, 'favicon.ico')}`, { stdio: 'ignore' });
  } else {
    execSync(`convert -background none -size 16x16 ${appIconPath} ${path.join(iconDir, 'favicon-16x16.png')}`, { stdio: 'ignore' });
    execSync(`convert -background none -size 32x32 ${appIconPath} ${path.join(iconDir, 'favicon-32x32.png')}`, { stdio: 'ignore' });
    execSync(`convert -background none -size 16x16 ${appIconPath} ${path.join(iconDir, 'favicon-16x16.png')} -size 32x32 ${appIconPath} ${path.join(iconDir, 'favicon-32x32.png')} ${path.join(iconDir, 'favicon.ico')}`, { stdio: 'ignore' });
  }
  console.log('✅ ファビコンを生成しました');
} catch (error) {
  console.error('❌ ファビコンの生成に失敗しました');
}

// スプラッシュスクリーンを生成
if (fs.existsSync(splashTemplatePath)) {
  console.log('🔄 スプラッシュスクリーンを生成しています...');
  
  const splashSizes = [
    { width: 2048, height: 2732 }, // 12.9インチiPad Pro
    { width: 2732, height: 2048 }, // 12.9インチiPad Pro - 横向き
    { width: 1668, height: 2388 }, // 11インチiPad Pro
    { width: 2388, height: 1668 }, // 11インチiPad Pro - 横向き
    { width: 1536, height: 2048 }, // 9.7インチiPad
    { width: 2048, height: 1536 }  // 9.7インチiPad - 横向き
  ];
  
  splashSizes.forEach(({ width, height }) => {
    const outputPath = path.join(iconDir, `apple-splash-${width}-${height}.png`);
    try {
      execSync(`convert -background none -resize ${width}x${height} ${splashTemplatePath} ${outputPath}`, { stdio: 'ignore' });
      console.log(`✅ 生成しました: ${outputPath}`);
    } catch (error) {
      console.error(`❌ エラー: ${outputPath} の生成に失敗しました`);
    }
  });
}

console.log('✨ 完了しました! PWAアセットが生成されました');
console.log('💡 ヒント: 生成されたアイコンは /public/icons/ ディレクトリにあります'); 