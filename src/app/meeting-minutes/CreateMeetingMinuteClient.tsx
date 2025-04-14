const ensureStorageBucket = async (): Promise<boolean> => {
  try {
    const { data: buckets, error: getBucketsError } = await supabase.storage.listBuckets();
    
    if (getBucketsError) {
      throw getBucketsError;
    }
    
    // 既存のバケットのリストを確認
    const bucketExists = buckets?.some(bucket => bucket.name === 'meeting_minutes');
    
    if (!bucketExists) {
      console.log('会議議事録バケットが存在しません。作成します。');
      // ストレージバケットの作成を実行
      const { error: createBucketError } = await supabase.storage.createBucket('meeting_minutes', {
        public: false,
        allowedMimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm'],
        fileSizeLimit: 50000000 // 50MB
      });
      
      if (createBucketError) {
        console.error('バケット作成エラー:', createBucketError);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('ストレージバケット確認エラー:', error);
    return false;
  }
};

// 音声ファイルをストレージに保存
const saveAudioToStorage = async (audioBlob: Blob): Promise<string | null> => {
  try {
    // ストレージの設定を確認
    const storageConfigured = await ensureStorageBucket();
    if (!storageConfigured) {
      toast({
        title: 'エラー',
        description: 'ストレージの設定が完了していません',
        variant: 'destructive',
      });
      return null;
    }

    // 一意のファイル名を生成
    const fileName = `audio_${Date.now()}.mp3`;
    
    // ファイルをアップロード
    const { data, error } = await supabase.storage
      .from('meeting_minutes')
      .upload(fileName, audioBlob, {
        contentType: 'audio/mpeg',
        cacheControl: '3600',
      });

    if (error) {
      console.error('音声ファイルアップロードエラー:', error);
      return null;
    }

    return data.path;
  } catch (error) {
    console.error('音声ファイル保存エラー:', error);
    return null;
  }
}; 