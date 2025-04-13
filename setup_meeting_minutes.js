require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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
    // ストレージバケットの作成
    console.log('ストレージバケットを作成します...');
    const { error: storageError } = await supabase.storage.createBucket('meeting_minutes', {
      public: false,
      fileSizeLimit: 50 * 1024 * 1024, // 50MB
    });
    
    if (storageError) {
      if (storageError.message.includes('already exists')) {
        console.log('ストレージバケットは既に存在します');
      } else {
        console.error('ストレージバケット作成エラー:', storageError.message);
      }
    } else {
      console.log('ストレージバケットの作成が完了しました');
    }

    // 会議種類マスターテーブルの作成
    console.log('会議種類テーブルを作成します...');
    
    const { error: typeTableError } = await supabase
      .from('meeting_types')
      .select('id')
      .limit(1);
    
    if (typeTableError && typeTableError.code === '42P01') { // テーブルが存在しないエラー
      console.log('会議種類テーブルを新規作成します');
      
      // テーブル作成
      const createMeetingTypesTable = await supabase.rpc('create_table_if_not_exists', {
        table_name: 'meeting_types',
        table_definition: `
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name TEXT NOT NULL,
          description TEXT,
          facility_id UUID REFERENCES facilities(id),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        `
      });
      
      if (createMeetingTypesTable.error) {
        console.error('会議種類テーブル作成エラー:', createMeetingTypesTable.error.message);
      } else {
        console.log('会議種類テーブルの作成が完了しました');
      }

      // サンプルデータ挿入
      const facilityData = await supabase.from('facilities').select('id').limit(1);
      
      if (!facilityData.error && facilityData.data?.length > 0) {
        const facilityId = facilityData.data[0].id;
        
        const sampleData = [
          { name: '検査室内会議', description: '部門内での定例会議', facility_id: facilityId },
          { name: '朝礼', description: '朝の業務確認会議', facility_id: facilityId },
          { name: 'スタッフミーティング', description: 'スタッフでの情報共有会議', facility_id: facilityId },
          { name: '委員会会議', description: '院内委員会での会議', facility_id: facilityId },
          { name: '役職会議', description: '主任や技師長会議', facility_id: facilityId },
          { name: '研修会', description: '研修や勉強会', facility_id: facilityId }
        ];
        
        const { error: insertError } = await supabase.from('meeting_types').insert(sampleData);
        
        if (insertError) {
          console.error('サンプルデータ挿入エラー:', insertError.message);
        } else {
          console.log('サンプルデータの挿入が完了しました');
        }
      }
    } else {
      console.log('会議種類テーブルは既に存在します');
    }

    // 会議議事録テーブルの作成
    console.log('会議議事録テーブルを作成します...');
    
    const { error: minutesTableError } = await supabase
      .from('meeting_minutes')
      .select('id')
      .limit(1);
    
    if (minutesTableError && minutesTableError.code === '42P01') { // テーブルが存在しないエラー
      console.log('会議議事録テーブルを新規作成します');
      
      // トリグラム拡張の有効化を試みる
      try {
        await supabase.rpc('execute_sql', { sql: 'CREATE EXTENSION IF NOT EXISTS pg_trgm;' });
        console.log('pg_trgm拡張を有効化しました');
      } catch (error) {
        console.warn('pg_trgm拡張の有効化に失敗しました:', error.message);
      }
      
      // テーブル作成
      const createMeetingMinutesTable = await supabase.rpc('create_table_if_not_exists', {
        table_name: 'meeting_minutes',
        table_definition: `
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          meeting_type_id UUID REFERENCES meeting_types(id),
          title TEXT NOT NULL,
          meeting_date TIMESTAMP WITH TIME ZONE NOT NULL,
          recorded_by UUID REFERENCES profiles(id),
          facility_id UUID REFERENCES facilities(id),
          department_id UUID REFERENCES departments(id),
          attendees TEXT[], 
          content TEXT,
          summary TEXT,
          audio_file_path TEXT,
          is_transcribed BOOLEAN DEFAULT FALSE,
          keywords TEXT[],
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        `
      });
      
      if (createMeetingMinutesTable.error) {
        console.error('会議議事録テーブル作成エラー:', createMeetingMinutesTable.error.message);
      } else {
        console.log('会議議事録テーブルの作成が完了しました');
        
        // インデックス作成
        try {
          await supabase.rpc('execute_sql', { 
            sql: `
              CREATE INDEX IF NOT EXISTS idx_meeting_minutes_meeting_type ON meeting_minutes(meeting_type_id);
              CREATE INDEX IF NOT EXISTS idx_meeting_minutes_facility ON meeting_minutes(facility_id);
              CREATE INDEX IF NOT EXISTS idx_meeting_minutes_department ON meeting_minutes(department_id);
              CREATE INDEX IF NOT EXISTS idx_meeting_minutes_meeting_date ON meeting_minutes(meeting_date);
            `
          });
          console.log('基本インデックスを作成しました');
          
          // トリグラムインデックスの作成を試みる
          try {
            await supabase.rpc('execute_sql', { 
              sql: `
                CREATE INDEX IF NOT EXISTS idx_meeting_minutes_content_trgm ON meeting_minutes USING GIN(content gin_trgm_ops);
                CREATE INDEX IF NOT EXISTS idx_meeting_minutes_title_trgm ON meeting_minutes USING GIN(title gin_trgm_ops);
                CREATE INDEX IF NOT EXISTS idx_meeting_minutes_summary_trgm ON meeting_minutes USING GIN(summary gin_trgm_ops);
              `
            });
            console.log('トリグラムインデックスを作成しました');
          } catch (error) {
            console.warn('トリグラムインデックス作成に失敗しました:', error.message);
          }
        } catch (error) {
          console.error('インデックス作成エラー:', error.message);
        }
      }
    } else {
      console.log('会議議事録テーブルは既に存在します');
    }
    
    console.log('セットアップが完了しました！');

  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

main(); 