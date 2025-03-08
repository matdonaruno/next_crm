-- サンプルタスクデータの挿入
-- 注意: 実際のユーザーIDとプロファイルIDを確認してから実行してください

-- 現在のプロファイル情報を確認
SELECT id, fullname, facility_id FROM profiles;

-- 現在の部署情報を確認
SELECT id, name, facility_id FROM departments WHERE facility_id = 'bd4e7203-2170-41a0-a6c5-c8235bab47ac';

-- 施設ID
-- 'bd4e7203-2170-41a0-a6c5-c8235bab47ac' を使用

-- 以下のINSERT文は、上記のSELECTで取得した実際のIDに置き換えてください
-- 以下はサンプルです。実際のIDに置き換えて実行してください。

-- 変数の設定（実際の値に置き換えてください）
DO $$
DECLARE
    facility_id UUID := 'bd4e7203-2170-41a0-a6c5-c8235bab47ac';
    
    -- 部署ID（実際の値に置き換えてください）
    dept_id1 UUID; -- 例: 血液凝固検査部門
    dept_id2 UUID; -- 例: 生理検査部門
    dept_id3 UUID; -- 例: 病理検査部門
    
    -- ユーザーID（実際の値に置き換えてください）
    user_id1 UUID; -- 例: 管理者
    user_id2 UUID; -- 例: 一般ユーザー
BEGIN
    -- 部署IDを取得（最初の3つの部署を使用）
    SELECT id INTO dept_id1 FROM departments WHERE facility_id = facility_id LIMIT 1 OFFSET 0;
    SELECT id INTO dept_id2 FROM departments WHERE facility_id = facility_id LIMIT 1 OFFSET 1;
    SELECT id INTO dept_id3 FROM departments WHERE facility_id = facility_id LIMIT 1 OFFSET 2;
    
    -- ユーザーIDを取得（最初の2人のユーザーを使用）
    SELECT id INTO user_id1 FROM profiles WHERE facility_id = facility_id LIMIT 1 OFFSET 0;
    SELECT id INTO user_id2 FROM profiles WHERE facility_id = facility_id LIMIT 1 OFFSET 1;
    
    -- サンプルタスクの挿入
    -- 部署1のタスク
    INSERT INTO tasks (title, description, status, department_id, facility_id, assigned_to, created_by)
    VALUES 
    ('試薬在庫確認', '血液凝固検査用の試薬在庫を確認し、不足分を発注する', 'pending', dept_id1, facility_id, user_id2, user_id1),
    ('機器メンテナンス', '血液凝固分析装置の定期メンテナンス', 'in_progress', dept_id1, facility_id, user_id1, user_id1),
    ('検査マニュアル更新', '血液凝固検査の手順マニュアルを最新の情報に更新する', 'completed', dept_id1, facility_id, user_id2, user_id1);
    
    -- 部署2のタスク
    INSERT INTO tasks (title, description, status, department_id, facility_id, assigned_to, created_by)
    VALUES 
    ('心電図検査準備', '明日の外来患者の心電図検査の準備をする', 'pending', dept_id2, facility_id, user_id1, user_id1),
    ('超音波検査装置点検', '超音波検査装置の点検とキャリブレーション', 'in_progress', dept_id2, facility_id, user_id2, user_id1),
    ('検査結果レポート作成', '今週の生理検査結果のレポートを作成する', 'completed', dept_id2, facility_id, user_id1, user_id2);
    
    -- 部署3のタスク
    INSERT INTO tasks (title, description, status, department_id, facility_id, assigned_to, created_by)
    VALUES 
    ('標本作製', '新規検体の標本作製', 'pending', dept_id3, facility_id, user_id2, user_id2),
    ('染色作業', 'HE染色とPAS染色の実施', 'in_progress', dept_id3, facility_id, user_id1, user_id2),
    ('病理診断補助', '病理医の診断補助作業', 'completed', dept_id3, facility_id, user_id2, user_id1);
    
    -- 部署未指定のタスク
    INSERT INTO tasks (title, description, status, facility_id, assigned_to, created_by)
    VALUES 
    ('全体ミーティング準備', '来週の全体ミーティングの資料準備', 'pending', facility_id, user_id1, user_id1),
    ('安全講習会参加', '臨床検査安全講習会への参加', 'in_progress', facility_id, user_id2, user_id1),
    ('年次報告書作成', '部門の年次報告書の作成と提出', 'completed', facility_id, user_id1, user_id2);
    
END $$;

-- 挿入されたタスクの確認
SELECT t.id, t.title, t.status, 
       d.name as department_name, 
       p1.fullname as assigned_to_name, 
       p2.fullname as created_by_name
FROM tasks t
LEFT JOIN departments d ON t.department_id = d.id
LEFT JOIN profiles p1 ON t.assigned_to = p1.id
LEFT JOIN profiles p2 ON t.created_by = p2.id
WHERE t.facility_id = 'bd4e7203-2170-41a0-a6c5-c8235bab47ac'
ORDER BY t.created_at DESC; 