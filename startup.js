// Next.jsスタンドアロンモード用のスタートアップスクリプト
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

// public ディレクトリへのパス
const publicDir = path.join(__dirname, 'public');
// standalone ディレクトリへのパス
const standaloneDir = path.join(__dirname, '.next/standalone');

// 静的ファイルをコピーする関数
const copyPublicToStandalone = () => {
  if (!fs.existsSync(standaloneDir)) {
    console.log('Standalone directory does not exist. Creating it...');
    fs.mkdirSync(standaloneDir, { recursive: true });
  }

  const targetDir = path.join(standaloneDir, 'public');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  try {
    // public ディレクトリの内容をコピー
    fs.cpSync(publicDir, targetDir, { recursive: true });
    console.log('Successfully copied public files to standalone directory');
  } catch (err) {
    console.error('Error copying public files:', err);
  }
};

app.prepare().then(() => {
  const server = express();

  // サービスワーカーの処理
  server.get('/sw.js', (req, res) => {
    const filePath = path.join(publicDir, 'sw.js');
    app.serveStatic(req, res, filePath);
  });

  // PWAマニフェストの処理
  server.get('/manifest.json', (req, res) => {
    const filePath = path.join(publicDir, 'manifest.json');
    res.sendFile(filePath);
  });

  // public ディレクトリの静的ファイルを提供
  server.use(express.static(publicDir));

  // Next.jsのリクエストハンドラ
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  // サーバー起動
  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${port}`);
    
    // 開発モードでない場合は静的ファイルをコピー
    if (!dev) {
      copyPublicToStandalone();
    }
  });
}); 