// src/app/layout.tsx
import { Geist, Geist_Mono, Inter } from "next/font/google";
import './globals.css';
import { Providers } from '@/components/Providers';
import AuthGateWrapper from '@/app/_providers/AuthGateWrapper.client'; // 絶対パスを使用
import { AuthProvider } from '@/contexts/AuthContext';
import type { Metadata, Viewport } from "next";

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
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/css/menu.css" />
        <link rel="stylesheet" href="/css/simple-css-waves.css" />
        
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
        
        {/* Apple Splashスクリーン画像を削除 - 不要なネットワークリクエストを減らす */}
        {/* Google Fonts は CSS ファイル内の @import で読み込み済み（重複を避けるため削除） */}
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${inter.className} antialiased`}>
        <Providers>
          <AuthProvider>
            <AuthGateWrapper>
              {children}
            </AuthGateWrapper>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}