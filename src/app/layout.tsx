// src/app/layout.tsx

'use client';

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "/public/css/menu.css"
import "/public/css/simple-css-waves.css"
import { AuthProvider } from "@/contexts/AuthContext";
import { ClientTokenCleaner } from "@/components/ClientTokenCleaner";
import { Toaster } from "@/components/ui/toaster";
import { useEffect } from 'react';
import { setupDatabase } from '@/lib/setupDatabase';

// フォント設定
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'Labo Logbook',
  description: '臨床検査現場向け記録管理システム',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // データベースのセットアップを実行
  useEffect(() => {
    const initDb = async () => {
      try {
        console.log("アプリケーション起動時のデータベースセットアップを開始");
        const result = await setupDatabase();
        console.log("データベースセットアップ結果:", result);
      } catch (error) {
        console.error("データベースセットアップ中にエラーが発生:", error);
      }
    };
    
    initDb();
  }, []);

  return (
    <html lang="ja">
      <head>
        <link
          href="https://fonts.googleapis.com/css?family=Montserrat:100,100i,200,200i,300,300i,400,400i,500,500i,600,600i,700,700i,800,800i,900,900i"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css?family=Poppins:400,500,600,700,800,900"
          rel="stylesheet"
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <ClientTokenCleaner />
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
