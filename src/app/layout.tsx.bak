// src/app/layout.tsx

'use client';

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "/public/css/menu.css"
import "/public/css/simple-css-waves.css"
import { AuthProvider } from "@/contexts/AuthContext";
import { ClientTokenCleaner } from "@/components/ClientTokenCleaner";
import { LoadingUI } from "@/components/LoadingUI";
import { Toaster } from "@/components/ui/toaster";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/common/Spinner";

// フォント設定
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 遷移制御コンポーネント
function TransitionManager({ children }: { children: React.ReactNode }) {
  const { isTransitioning } = useAuth();
  const [stableContent, setStableContent] = useState<React.ReactNode>(null);
  
  // 遷移状態が変わった時に安定したコンテンツを保存
  useEffect(() => {
    if (!isTransitioning) {
      setStableContent(children);
    }
  }, [isTransitioning, children]);
  
  // 遷移中は前の状態を表示しつつオーバーレイでローディングを表示
  if (isTransitioning) {
    return (
      <>
        {stableContent || children}
        <div className="fixed inset-0 bg-white bg-opacity-80 z-[9999] flex items-center justify-center">
          <div className="text-center p-6 bg-white rounded-lg shadow-xl">
            <Spinner size="lg" color="primary" />
            <p className="mt-4 text-gray-700 font-medium">画面遷移中...</p>
          </div>
        </div>
      </>
    );
  }
  
  return <>{children}</>;
}

// 実際のルートレイアウトはAuthProviderの内側でのみTransitionManagerをレンダリング
function RootLayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <TransitionManager>
      <ClientTokenCleaner />
      <LoadingUI />
      {children}
      <Toaster />
    </TransitionManager>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <title>Labo Logbook</title>
        <meta name="description" content="臨床検査現場向け記録管理システム" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
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
          <RootLayoutContent>
            {children}
          </RootLayoutContent>
        </AuthProvider>
      </body>
    </html>
  );
}
