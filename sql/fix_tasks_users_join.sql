-- タスクピックページのクエリで使用されている users: profiles(id, fullname) の部分を修正

-- 現在のクエリ:
-- .from('tasks')
-- .select('*, users: profiles(id, fullname)')
-- .eq('department_id', departmentId)
-- .order('created_at', { ascending: false });

-- 問題: Supabaseの外部キー参照では、デフォルトでは assigned_to -> profiles.id の関係が
-- 'users' という名前で参照できない可能性があります。

-- 解決策1: ビューを作成して、関連するプロファイル情報を含める
CREATE OR REPLACE VIEW tasks_with_users AS
SELECT 
  t.*,
  p_assigned.id AS assigned_user_id,
  p_assigned.fullname AS assigned_user_fullname,
  p_created.id AS created_user_id,
  p_created.fullname AS created_user_fullname
FROM 
  tasks t
LEFT JOIN 
  profiles p_assigned ON t.assigned_to = p_assigned.id
LEFT JOIN 
  profiles p_created ON t.created_by = p_created.id;

-- このビューに対するRLSポリシーを作成
ALTER VIEW tasks_with_users SECURITY INVOKER;

-- 解決策2: Supabaseの外部キー参照名を明示的に設定
-- 注意: これはテーブル作成時に行うべきですが、既存のテーブルに対しては以下のように変更できます

-- まず既存の外部キー制約を削除
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_assigned_to;

-- 新しい名前で外部キー制約を追加
ALTER TABLE tasks 
ADD CONSTRAINT fk_users 
FOREIGN KEY (assigned_to) 
REFERENCES profiles(id) 
ON DELETE SET NULL;

-- 解決策3: クライアントコードを修正して、正しい参照名を使用する
-- 例: .select('*, assigned_user:profiles(id, fullname)')

-- 確認クエリ: タスクとユーザー情報を結合して取得
SELECT 
  t.id, 
  t.title, 
  t.status,
  t.department_id,
  d.name AS department_name,
  t.assigned_to,
  p1.fullname AS assigned_to_name,
  t.created_by,
  p2.fullname AS created_by_name
FROM 
  tasks t
LEFT JOIN 
  departments d ON t.department_id = d.id
LEFT JOIN 
  profiles p1 ON t.assigned_to = p1.id
LEFT JOIN 
  profiles p2 ON t.created_by = p2.id
WHERE 
  t.facility_id = 'bd4e7203-2170-41a0-a6c5-c8235bab47ac'
ORDER BY 
  t.created_at DESC; 