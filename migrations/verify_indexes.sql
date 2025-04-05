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

-- 2. サンプルクエリでインデックスが使用されるか確認（実行計画の確認）
-- 時間あたりの招待メール送信回数カウント
EXPLAIN ANALYZE
SELECT COUNT(*) 
FROM user_activity_logs 
WHERE user_id = '任意のユーザーID' -- 実際のユーザーIDに置き換え
AND action_type = 'user_invitation_sent'
AND created_at >= NOW() - INTERVAL '1 hour';

-- 施設ごとの招待メール送信回数カウント
EXPLAIN ANALYZE
SELECT COUNT(*) 
FROM user_activity_logs 
WHERE action_type = 'user_invitation_sent'
AND created_at >= NOW() - INTERVAL '24 hours'
AND action_details->>'facility_id' = '任意の施設ID'; -- 実際の施設IDに置き換え

-- 特定のメールアドレスへの招待履歴確認
EXPLAIN ANALYZE
SELECT * 
FROM user_activity_logs 
WHERE action_type = 'user_invitation_sent'
AND action_details->>'invited_email' = 'sample@example.com' -- 実際のメールアドレスに置き換え
ORDER BY created_at DESC;

-- 注意: EXPLAIN ANALYZEの結果に「Index Scan」または「Bitmap Index Scan」が表示されていれば、
-- インデックスが正しく使用されています。「Seq Scan」（シーケンシャルスキャン）が表示される場合は
-- インデックスが使用されていない可能性があります。 