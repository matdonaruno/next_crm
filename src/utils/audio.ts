/**
 * 音声ファイル関連のユーティリティ関数
 */

/**
 * ファイルパスからバケット名のプレフィックスを削除する
 * @param path オリジナルのファイルパス（例: minutesaudio/meeting_recordings/xxx/file.mp3）
 * @returns 整形されたパス（例: meeting_recordings/xxx/file.mp3）
 * @throws {Error} パスがnullまたはundefinedの場合
 */
export const stripBucketName = (path: string): string => {
  if (path == null) {
    throw new Error('Invalid audio path: path cannot be null or undefined');
  }
  return path.replace(/^minutesaudio\//, '');
};

/**
 * ファイルパスからファイル名部分のみを取得する
 * @param path ファイルパス
 * @returns ファイル名のみ
 */
export const getFileNameFromPath = (path: string): string => {
  if (!path) return '';
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
};

/**
 * 適切なストレージパスを生成する
 * @param filePath ファイルパス
 * @param facilityId 施設ID
 * @returns 整形されたパス
 */
export const getStoragePath = (filePath: string, facilityId: string): string => {
  // バケット名を削除
  const withoutBucket = stripBucketName(filePath);
  
  // 施設IDを追加（既に存在する場合はそのまま）
  return withoutBucket.startsWith('meeting_recordings/') 
    ? withoutBucket 
    : `meeting_recordings/${facilityId}/${withoutBucket}`;
}; 