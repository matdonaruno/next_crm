-- インデックスが正しく追加されたことを確認するクエリ

-- 1. データベース内のuser_activity_logsテーブルに対するインデックスを一覧表示
SELECT 
    indexname, 
    indexdef 
FROM 
    pg_indexes 
WHERE 
    tablename = 'user_activity_logs' 
ORDER BY 
    indexname;

-- 実際の実行では、以下のクエリのプレースホルダーを実際の値に置き換える必要があります
-- まず最初にデータベースに存在するuser_idを取得します
SELECT user_id FROM user_activity_logs LIMIT 1;

-- 時間あたりの招待メール送信回数カウント
-- 実行時に上記で取得したuser_idを使用
-- EXPLAIN ANALYZE
-- SELECT COUNT(*) 
-- FROM user_activity_logs 
-- WHERE user_id = '実際のUUID値' -- 例：'123e4567-e89b-12d3-a456-426614174000'
-- AND action_type = 'user_invitation_sent'
-- AND created_at >= NOW() - INTERVAL '1 hour';

-- または、特定のユーザーIDを指定せずにクエリを実行
EXPLAIN ANALYZE
SELECT COUNT(*) 
FROM user_activity_logs 
WHERE action_type = 'user_invitation_sent'
AND created_at >= NOW() - INTERVAL '1 hour';

-- 施設ごとの招待メール送信回数カウント
-- 実際のfacility_idを確認
SELECT DISTINCT action_details->>'facility_id' FROM user_activity_logs 
WHERE action_details->>'facility_id' IS NOT NULL
LIMIT 5;

-- 上記で取得した実際の施設IDを使用してクエリを実行
-- EXPLAIN ANALYZE
-- SELECT COUNT(*) 
-- FROM user_activity_logs 
-- WHERE action_type = 'user_invitation_sent'
-- AND created_at >= NOW() - INTERVAL '24 hours'
-- AND action_details->>'facility_id' = '実際の施設ID'; -- 例：'1'

-- または、施設IDを指定せずに実行
EXPLAIN ANALYZE
SELECT COUNT(*) 
FROM user_activity_logs 
WHERE action_type = 'user_invitation_sent'
AND created_at >= NOW() - INTERVAL '24 hours';

-- 特定のメールアドレスへの招待履歴確認
-- 実際のメールアドレスを確認
SELECT DISTINCT action_details->>'invited_email' FROM user_activity_logs 
WHERE action_details->>'invited_email' IS NOT NULL
LIMIT 5;

-- 上記で取得した実際のメールアドレスを使用
-- EXPLAIN ANALYZE
-- SELECT * 
-- FROM user_activity_logs 
-- WHERE action_type = 'user_invitation_sent'
-- AND action_details->>'invited_email' = '実際のメールアドレス'; -- 例：'user@example.com'

-- または、メールアドレスを指定せずに実行
EXPLAIN ANALYZE
SELECT * 
FROM user_activity_logs 
WHERE action_type = 'user_invitation_sent'
ORDER BY created_at DESC
LIMIT 10;

-- 注意: EXPLAIN ANALYZEの結果に「Index Scan」または「Bitmap Index Scan」が表示されていれば、
-- インデックスが正しく使用されています。「Seq Scan」（シーケンシャルスキャン）が表示される場合は
-- インデックスが使用されていない可能性がありますが、データ量が少ない場合は正常です。 