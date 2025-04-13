// @ts-nocheck
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function main() {
  // Supabaseクライアントの初期化
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE;
  
  console.log('URL:', supabaseUrl);
  console.log('SERVICE_ROLE exists:', !!supabaseServiceKey);

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('環境変数が設定されていません');
    process.exit(1);
  }

  // 引用符を取り除く
  const cleanServiceKey = supabaseServiceKey.replace(/"/g, '');
  
  const supabase = createClient(supabaseUrl, cleanServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // SQLファイルの読み込み
    const sqlPath = path.join(process.cwd(), 'sql', 'create_meeting_minutes_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('SQLファイルを読み込みました');
    
    // SQL実行
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      throw error;
    }

    console.log('会議議事録管理テーブルの作成が完了しました');
    
    // ストレージバケットの作成（音声ファイル保存用）
    const { error: storageError } = await supabase.storage.createBucket('meeting_minutes', {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024, // 50MB
    });
    
    if (storageError && !storageError.message.includes('already exists')) {
      console.warn('ストレージバケット作成時の警告:', storageError);
    } else {
      console.log('ストレージバケットの作成が完了しました');
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

main(); 