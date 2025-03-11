'use client';

import { useEffect } from "react";

export function ClientTokenCleaner() {
  // 古いトークンキーを削除する処理
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log("ClientTokenCleaner: 初期化");
      const oldKey = 'supabase.auth.token';
      if (localStorage.getItem(oldKey)) {
        console.log("ClientTokenCleaner: 古いトークンキーを削除します");
        localStorage.removeItem(oldKey);
        // 古いキーが存在した場合は、ページをリロードして新しいキーで認証状態を初期化
        window.location.reload();
      }
    }
  }, []);
  
  // このコンポーネントは何も表示しない
  return null;
} 