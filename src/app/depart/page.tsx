'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient'; 

interface Department {
    id: string;
    name: string;
  }

export default function Home() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [activeDept, setActiveDept] = useState<string | null>(null);
  // ハンバーガーメニューの開閉ロジック
  useEffect(() => {
    const body = document.querySelector('body');
    const menuIcon = document.querySelector('.menu-icon');
    if (!menuIcon || !body) return;

    const handleClick = () => {
      body.classList.toggle('nav-active');
    };

    menuIcon.addEventListener('click', handleClick);

      
    async function fetchDepartments() {
        const { data, error } = await supabase
          .from("departments")
          .select('*');
        if (error) {
          console.error("Error fetching departments:", error);
        } else if (data) {
          setDepartments(data);
          if (data.length > 0) {
            setActiveDept(data[0].id);
          }
        }
      }
      fetchDepartments();

      return () => {
      menuIcon.removeEventListener('click', handleClick);
    };
  }, []);

  return (
    <div
      className="header w-full min-h-screen relative"
      style={{
        background: 'linear-gradient(60deg, #fcd1e8 0%, #dccbf8 100%)', // うすピンク→薄紫
      }}
    >
      {/* ===================== ハンバーガーメニュー + Nav ===================== */}
      <header className="cd-header">
        <div className="header-wrapper">
          <div className="logo-wrap">
            <a href="#" className="hover-target">
              <span>life has</span>limit
            </a>
          </div>
          <div className="nav-but-wrap">
            <div className="menu-icon hover-target">
              <span className="menu-icon__line menu-icon__line-left"></span>
              <span className="menu-icon__line"></span>
              <span className="menu-icon__line menu-icon__line-right"></span>
            </div>
          </div>
        </div>
      </header>

      {/* サイドメニュー */}
      <div className="nav">
        <div className="nav__content">
        <ul className="nav__list">
            {departments.map((dept) => (
              <li key={dept.id} className="nav__list-item acive-nav">
                <Link
                  href={`/taskpick?department=${encodeURIComponent(dept.name)}&departmentId=${dept.id}`}
                  className={`
                    px-6 py-2 
                    rounded-lg 
                    transition-colors
                    ${activeDept === dept.id
                      ? ' text-white'
                      : ' '
                    }
                  `}
                >
                  {dept.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ===================== メインコンテンツ ===================== */}
      <div className="inner-header flex">
        <center>
            <div className="text-2xl font-bold" style={{ color: '#8167a9' }}>Labo Logbook</div>
        </center>
      </div>

      <div>
        <center>
            <div className="text-1xl font-bold" style={{ color: '#8167a9' }}>メニューから部署を選択してはじめましょう</div>
        </center>
      </div>

      {/* 下部のウェーブSVG */}
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

      <div className="content flex">
        <p>for your side partner | designed By.Goodkatz</p>
      </div>
    </div>
  );
}
