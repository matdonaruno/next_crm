-- user_activity_logsテーブルに対するインデックスを追加
-- メール送信制限機能の高速化のためのインデックス

-- 基本的なインデックス
-- ユーザーIDとアクションタイプの組み合わせに対するインデックス（ユーザーごとの特定アクション検索を高速化）
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id_action_type
ON public.user_activity_logs (user_id, action_type);

-- アクションタイプと作成日時に対するインデックス（特定アクションの時系列検索を高速化）
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_action_type_created_at
ON public.user_activity_logs (action_type, created_at);

-- ユーザーIDとアクションタイプと作成日時の組み合わせに対するインデックス（ユーザーごとの特定期間内アクション検索を高速化）
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_action_time
ON public.user_activity_logs (user_id, action_type, created_at);

-- 招待メール制限のためのJSONBインデックス
-- action_detailsのfacility_idフィールドに対するGINインデックス
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_facility_id
ON public.user_activity_logs USING GIN ((action_details -> 'facility_id'));

-- action_detailsのinvited_emailフィールドに対するGINインデックス（将来的なメールアドレスごとの制限のため）
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_invited_email
ON public.user_activity_logs USING GIN ((action_details -> 'invited_email'));

-- 以下の3つのクエリが特に最適化されます：
-- 1. ユーザーの時間あたり/日あたり/月あたりの招待数のカウント
-- 2. 施設ごとの招待数のカウント
-- 3. 特定のメールアドレスへの招待履歴の検索

-- コメント：GINインデックスはJSONBフィールド検索を高速化しますが、インデックスサイズが大きくなる可能性があるため、
-- 将来的にはパフォーマンスとストレージのバランスを考慮して調整が必要かもしれません。 