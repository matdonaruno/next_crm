#!/bin/bash

# PWAアセット生成のためのスクリプト

# 色
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== PWAアセット生成ツール ===${NC}"

# ImageMagickがインストールされているか確認
if ! command -v convert &> /dev/null; then
    echo -e "${RED}ImageMagick (convert)が見つかりません。${NC}"
    echo -e "インストール方法: ${GREEN}brew install imagemagick${NC}"
    echo -e "または: https://imagemagick.org/script/download.php"
    exit 1
fi

# 必要なディレクトリを作成
SCRIPT_DIR=$(dirname "$0")
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PUBLIC_DIR="$ROOT_DIR/public"
ICONS_DIR="$PUBLIC_DIR/icons"

mkdir -p "$ICONS_DIR"

echo -e "${BLUE}PWAアイコンを生成しています...${NC}"
node "$SCRIPT_DIR/convert-svg-to-png.js"

# マニフェストファイルを確認
if [ -f "$PUBLIC_DIR/manifest.json" ]; then
    echo -e "${GREEN}マニフェストファイルを確認しました: $PUBLIC_DIR/manifest.json${NC}"
else
    echo -e "${RED}マニフェストファイルが見つかりません!${NC}"
    echo -e "manifest.jsonを作成してください: $PUBLIC_DIR/manifest.json"
fi

# 生成されたファイルの確認
echo -e "${BLUE}生成されたファイル:${NC}"
find "$ICONS_DIR" -type f | grep -v "\.svg$" | sort

echo -e "\n${GREEN}完了しました！${NC}"
echo -e "これらのファイルは.gitignoreに追加されています。編集が必要な場合はSVGファイルを修正してください。" 