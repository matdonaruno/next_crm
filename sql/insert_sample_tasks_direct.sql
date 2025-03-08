-- サンプルタスクデータの直接挿入（DO文を使わないバージョン）
-- 注意: 実際のユーザーIDとプロファイルIDを確認してから実行してください

-- 現在のプロファイル情報を確認
SELECT id, fullname, facility_id FROM profiles;

-- 現在の部署情報を確認
SELECT id, name, facility_id FROM departments WHERE facility_id = 'bd4e7203-2170-41a0-a6c5-c8235bab47ac';

-- 以下のINSERT文は、上記のSELECTで取得した実際のIDに置き換えてください
-- 以下はサンプルです。実際のIDに置き換えて実行してください。

-- 施設ID
-- 'bd4e7203-2170-41a0-a6c5-c8235bab47ac' を使用

-- 部署ID（実際の値に置き換えてください）
-- dept_id1: '部署ID1を入力' -- 例: 血液凝固検査部門
-- dept_id2: '部署ID2を入力' -- 例: 生理検査部門
-- dept_id3: '部署ID3を入力' -- 例: 病理検査部門

-- ユーザーID（実際の値に置き換えてください）
-- user_id1: '管理者のIDを入力'
-- user_id2: '一般ユーザーのIDを入力'

-- 部署1のタスク
INSERT INTO tasks (title, description, status, department_id, facility_id, assigned_to, created_by)
VALUES 
('試薬在庫確認', '血液凝固検査用の試薬在庫を確認し、不足分を発注する', 'pending', 
 '部署ID1を入力', 'bd4e7203-2170-41a0-a6c5-c8235bab47ac', '一般ユーザーのIDを入力', '管理者のIDを入力'),
('機器メンテナンス', '血液凝固分析装置の定期メンテナンス', 'in_progress', 
 '部署ID1を入力', 'bd4e7203-2170-41a0-a6c5-c8235bab47ac', '管理者のIDを入力', '管理者のIDを入力'),
('検査マニュアル更新', '血液凝固検査の手順マニュアルを最新の情報に更新する', 'completed', 
 '部署ID1を入力', 'bd4e7203-2170-41a0-a6c5-c8235bab47ac', '一般ユーザーのIDを入力', '管理者のIDを入力');

-- 部署2のタスク
INSERT INTO tasks (title, description, status, department_id, facility_id, assigned_to, created_by)
VALUES 
('心電図検査準備', '明日の外来患者の心電図検査の準備をする', 'pending', 
 '部署ID2を入力', 'bd4e7203-2170-41a0-a6c5-c8235bab47ac', '管理者のIDを入力', '管理者のIDを入力'),
('超音波検査装置点検', '超音波検査装置の点検とキャリブレーション', 'in_progress', 
 '部署ID2を入力', 'bd4e7203-2170-41a0-a6c5-c8235bab47ac', '一般ユーザーのIDを入力', '管理者のIDを入力'),
('検査結果レポート作成', '今週の生理検査結果のレポートを作成する', 'completed', 
 '部署ID2を入力', 'bd4e7203-2170-41a0-a6c5-c8235bab47ac', '管理者のIDを入力', '一般ユーザーのIDを入力');

-- 部署3のタスク
INSERT INTO tasks (title, description, status, department_id, facility_id, assigned_to, created_by)
VALUES 
('標本作製', '新規検体の標本作製', 'pending', 
 '部署ID3を入力', 'bd4e7203-2170-41a0-a6c5-c8235bab47ac', '一般ユーザーのIDを入力', '一般ユーザーのIDを入力'),
('染色作業', 'HE染色とPAS染色の実施', 'in_progress', 
 '部署ID3を入力', 'bd4e7203-2170-41a0-a6c5-c8235bab47ac', '管理者のIDを入力', '一般ユーザーのIDを入力'),
('病理診断補助', '病理医の診断補助作業', 'completed', 
 '部署ID3を入力', 'bd4e7203-2170-41a0-a6c5-c8235bab47ac', '一般ユーザーのIDを入力', '管理者のIDを入力');

-- 部署未指定のタスク
INSERT INTO tasks (title, description, status, facility_id, assigned_to, created_by)
VALUES 
('全体ミーティング準備', '来週の全体ミーティングの資料準備', 'pending', 
 'bd4e7203-2170-41a0-a6c5-c8235bab47ac', '管理者のIDを入力', '管理者のIDを入力'),
('安全講習会参加', '臨床検査安全講習会への参加', 'in_progress', 
 'bd4e7203-2170-41a0-a6c5-c8235bab47ac', '一般ユーザーのIDを入力', '管理者のIDを入力'),
('年次報告書作成', '部門の年次報告書の作成と提出', 'completed', 
 'bd4e7203-2170-41a0-a6c5-c8235bab47ac', '管理者のIDを入力', '一般ユーザーのIDを入力');

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