#!/bin/bash

# 必要なディレクトリを作成
mkdir -p public/icons

# SVGからPNGを生成するコマンド
# ここではSVGから各サイズのPNGを生成する方法を説明
# 実際のプロジェクトではImageMagickやInkscapeなどのツールを使う必要があります

echo "以下のファイルを作成する必要があります："
echo "1. 標準アイコン"
echo "- public/icons/icon-72x72.png"
echo "- public/icons/icon-96x96.png"
echo "- public/icons/icon-128x128.png"
echo "- public/icons/icon-144x144.png"
echo "- public/icons/icon-152x152.png"
echo "- public/icons/icon-192x192.png"
echo "- public/icons/icon-384x384.png"
echo "- public/icons/icon-512x512.png"
echo "- public/icons/icon-1024x1024.png"
echo ""
echo "2. Appleデバイス用アイコン"
echo "- public/icons/apple-touch-icon.png (180x180)"
echo "- public/icons/apple-touch-icon-152x152.png"
echo "- public/icons/apple-touch-icon-167x167.png"
echo "- public/icons/apple-touch-icon-180x180.png"
echo ""
echo "3. ファビコン"
echo "- public/icons/favicon-16x16.png"
echo "- public/icons/favicon-32x32.png"
echo "- public/icons/favicon.ico"
echo ""
echo "4. iPad用スプラッシュスクリーン"
echo "- public/icons/apple-splash-2048-2732.png (12.9インチiPad Pro)"
echo "- public/icons/apple-splash-2732-2048.png (12.9インチiPad Pro - 横向き)"
echo "- public/icons/apple-splash-1668-2388.png (11インチiPad Pro)"
echo "- public/icons/apple-splash-2388-1668.png (11インチiPad Pro - 横向き)"
echo "- public/icons/apple-splash-1536-2048.png (9.7インチiPad)"
echo "- public/icons/apple-splash-2048-1536.png (9.7インチiPad - 横向き)"
echo ""
echo "SVGからこれらの画像を生成するには、以下のツールが便利です："
echo "1. ImageMagick (convert コマンド)"
echo "2. Inkscape"
echo "3. オンラインツール: https://maskable.app/, https://appsco.pe/developer/splash-screens"
echo ""
echo "このスクリプトを実行したら、上記のツールを使用して必要な画像を生成してください。" 