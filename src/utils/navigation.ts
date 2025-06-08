/**
 * App Router互換のルート変更検出ユーティリティ
 * - router.eventsが非推奨なので、パス変化検知で代替
 */

/**
 * ルート変更を検知するリスナーを作成
 * @param callback ルート変更時に実行されるコールバック
 */
export function createRouteChangeListener(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  // MutationObserverでURLの変更を検出
  const observer = new MutationObserver(() => {
    const currentPath = window.location.pathname + window.location.search;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      callback();
    }
  });

  // 初期パス
  let lastPath = window.location.pathname + window.location.search;

  // bodyの変更を監視（URL変更はDOM更新を伴うため）
  observer.observe(document.body, { 
    childList: true, 
    subtree: true 
  });

  // クリーンアップ関数
  return () => {
    observer.disconnect();
  };
}

export const goto = (path: string) => window.location.assign(path); 