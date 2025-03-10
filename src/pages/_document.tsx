//src/pages/_document.tsx
import Document, { Html, Head, Main, NextScript } from 'next/document';

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          {/* マニフェストファイルの指定 */}
          <link rel="manifest" href="/manifest.json" />
          
          {/* Apple Touch Icon の指定 */}
          <link rel="apple-touch-icon" sizes="192x192" href="/icon-192x192.png" />
          <link rel="apple-touch-icon" sizes="512x512" href="/icon-512x512.png" />
          <link rel="apple-touch-icon" sizes="1024x1024" href="/icon.png" />
          
          {/* PWA設定 */}
          <meta name="application-name" content="Labo Logbook" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <meta name="apple-mobile-web-app-title" content="LaboLog" />
          <meta name="theme-color" content="#dccbf8" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;