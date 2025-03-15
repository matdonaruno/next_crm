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

// フォント設定
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
          <ClientTokenCleaner />
          <LoadingUI />
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
