// src/app/layout.tsx

// 'use client'; // ★ 削除: サーバーコンポーネントに戻す

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "/public/css/menu.css"
import "/public/css/simple-css-waves.css"
// import { AuthProvider } from "@/contexts/AuthContext"; // ClientLayoutWrapper に移動
// import { ClientTokenCleaner } from "@/components/ClientTokenCleaner"; // ClientLayoutWrapper に移動
// import { LoadingUI } from "@/components/LoadingUI"; // ClientLayoutWrapper に移動
// import { Toaster } from "@/components/ui/toaster"; // ClientLayoutWrapper に移動
// import { PageTransition } from "@/components/PageTransition"; // ClientLayoutWrapper に移動
import ClientLayoutWrapper from "@/components/ClientLayoutWrapper"; // ★ 新しいラッパーをインポート
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

// フォント設定
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({ subsets: ["latin"] });

const APP_NAME = "LaboLogbook";
const APP_DEFAULT_TITLE = "LaboLogbook";
const APP_TITLE_TEMPLATE = "%s | LaboLogbook";
const APP_DESCRIPTION = "Laboratory equipment and reagent management system";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_DEFAULT_TITLE,
    template: APP_TITLE_TEMPLATE,
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_DEFAULT_TITLE,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icons/favicon.ico",
    shortcut: "/icons/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
    other: [
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        url: "/icons/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        url: "/icons/favicon-16x16.png",
      },
      {
        rel: "icon",
        sizes: "192x192",
        url: "/icons/android-chrome-192x192.png",
        type: "image/png"
      },
      {
        rel: "icon",
        sizes: "512x512",
        url: "/icons/android-chrome-512x512.png",
        type: "image/png"
      }
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        
        <meta name="theme-color" content="#8167a9" />
        
        <meta name="mobile-web-app-capable" content="yes" />
        
        <meta name="apple-touch-fullscreen" content="yes" />
        <meta name="apple-mobile-web-app-orientations" content="portrait" />
        
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (window.navigator.standalone) {
                  document.documentElement.classList.add('standalone');
                }
                
                // iOS 16.4以降のdisplayModeをチェック
                if (window.matchMedia('(display-mode: fullscreen)').matches) {
                  document.documentElement.classList.add('fullscreen-mode');
                }
                
                // fullscreenへの対応
                if (document.fullscreenEnabled) {
                  window.addEventListener('click', function() {
                    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                      document.documentElement.requestFullscreen();
                    }
                  }, { once: true });
                }
              })();
            `,
          }}
        />
        
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2048-2732.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2732-2048.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1668-2388.png" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2388-1668.png" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1536-2048.png" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-2048-1536.png" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" />
        
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1284-2778.png" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1170-2532.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1125-2436.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1242-2688.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-828-1792.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-1242-2208.png" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-750-1334.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/icons/apple-splash-640-1136.png" media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        
        <link
          href="https://fonts.googleapis.com/css?family=Montserrat:100,100i,200,200i,300,300i,400,400i,500,500i,600,600i,700,700i,800,800i,900,900i"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css?family=Poppins:400,500,600,700,800,900"
          rel="stylesheet"
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${inter.className} antialiased`}>
        {/* ★ ClientLayoutWrapper でラップ */}
        <ClientLayoutWrapper>
          {children}
        </ClientLayoutWrapper>
      </body>
    </html>
  );
}
