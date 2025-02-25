// src/app/page.tsx
'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <div className="header w-full min-h-screen relative">
      {/* ヘッダー内ロゴ部分 */}
      <div className="inner-header flex">
        <center>
          <div className="text-2xl font-bold">Labo Logbook</div>
          <div className="mt-20">
            <Link href="/login" className="button is-link is-inverted is-outlined" role="button">
            &nbsp;login&nbsp;
            </Link>
          </div>
        </center>
      </div>
      
      {/* キャッチコピー */}
      <div>
        <center>あなたの大切な時間を節約しましょう</center>
      </div>
      {/* ウェーブのSVG */}
      <div>
        <svg
          className="waves"
          xmlns="http://www.w3.org/2000/svg"
          xmlnsXlink="http://www.w3.org/1999/xlink"
          viewBox="0 24 150 28"
          preserveAspectRatio="none"
          shapeRendering="auto"
        >
          <defs>
            <path id="gentle-wave" d="M-160 44c30 0 58-18 88-18s58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z" />
          </defs>
          <g className="parallax">
            <use xlinkHref="#gentle-wave" x="48" y="0" fill="rgba(255,255,255,0.7)" />
            <use xlinkHref="#gentle-wave" x="48" y="3" fill="rgba(255,255,255,0.5)" />
            <use xlinkHref="#gentle-wave" x="48" y="5" fill="rgba(255,255,255,0.3)" />
            <use xlinkHref="#gentle-wave" x="48" y="7" fill="#fff" />
          </g>
        </svg>
      </div>
      {/* フッターコンテンツ */}
      <div className="content flex">
        <p>for your saide partner | designed By.Goodkatz</p>
      </div>
    </div>
  );
}
