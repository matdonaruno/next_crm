import { useEffect } from 'react';
import { setSessionCheckEnabled } from '@/contexts/AuthContext';

/**
 * 特定のコンポーネントでセッション確認を有効化/無効化するためのフック
 * 
 * @param enabled セッション確認を有効にするかどうか
 * @param dependencies 依存配列（変更時にセッション確認の状態が再評価される）
 */
export function useSessionCheck(enabled: boolean = true, dependencies: any[] = []) {
  useEffect(() => {
    // コンポーネントマウント時にセッション確認の状態を設定
    console.log(`セッション確認を${enabled ? '有効化' : '無効化'}します`);
    setSessionCheckEnabled(enabled);
    
    // クリーンアップ時に元の状態に戻す
    return () => {
      console.log('セッション確認の状態をリセットします');
      setSessionCheckEnabled(true); // デフォルトは有効に戻す
    };
  }, dependencies);
} 