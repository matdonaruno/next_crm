require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function main() {
  // Supabaseクライアントの初期化
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE?.replace(/"/g, '');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('環境変数が設定されていません');
    process.exit(1);
  }

  console.log('Supabase URL:', supabaseUrl);
  console.log('Service Key is set:', !!supabaseServiceKey);

  // Supabaseクライアント作成
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // バケット一覧の取得
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      console.error('バケット一覧取得エラー:', listError.message);
      process.exit(1);
    }

    console.log('現在のバケット:', buckets.map(b => b.name));

    // minutesaudioバケットの存在確認
    const minutesaudioExists = buckets.some(bucket => bucket.name === 'minutesaudio');

    if (minutesaudioExists) {
      console.log('minutesaudioバケットは既に存在します');
      process.exit(0);
    }

    // ストレージバケットの作成
    console.log('minutesaudioストレージバケットを作成します...');
    const { error: storageError } = await supabase.storage.createBucket('minutesaudio', {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024, // 50MB
    });
    
    if (storageError) {
      console.error('ストレージバケット作成エラー:', storageError.message);
      process.exit(1);
    } else {
      console.log('minutesaudioストレージバケットの作成が完了しました');
    }

    // ポリシーの設定
    console.log('ストレージバケットのポリシーを設定します...');
    const { error: policyError } = await supabase.storage.from('minutesaudio').createPolicy(
      'allow-all-for-authenticated',
      {
        name: 'allow-all-for-authenticated',
        definition: {
          role: 'authenticated',
          match: { bucket: 'minutesaudio' },
          permissions: ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
        }
      }
    );

    if (policyError) {
      console.error('ポリシー設定エラー:', policyError.message);
    } else {
      console.log('ストレージバケットのポリシー設定が完了しました');
    }

    console.log('セットアップが完了しました！');
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

main(); 