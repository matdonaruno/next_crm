-- 主任ロールを追加するマイグレーション
-- 実行日: 2025-06-04

-- 1. 既存のENUM型を拡張して chief (主任) ロールを追加
-- PostgreSQLでは直接ENUMを変更できないため、一時的な処理が必要
BEGIN;

-- 新しいロール定義を作成
CREATE TYPE user_role_new AS ENUM ('superuser', 'facility_admin', 'chief', 'approver', 'regular_user');

-- 既存のカラムを新しい型に変更
ALTER TABLE profiles 
    ALTER COLUMN role TYPE user_role_new 
    USING role::text::user_role_new;

ALTER TABLE user_invitations 
    ALTER COLUMN role TYPE user_role_new 
    USING role::text::user_role_new;

-- 古い型を削除
DROP TYPE user_role;

-- 新しい型を正式な名前に変更
ALTER TYPE user_role_new RENAME TO user_role;

COMMIT;

-- 2. 会議議事録テーブルに閲覧制限レベルを追加
ALTER TABLE meeting_minutes
ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'all' 
CHECK (access_level IN ('all', 'chief_and_above', 'admin_only'));

-- access_levelカラムの説明：
-- 'all': すべてのユーザーが閲覧可能（デフォルト）
-- 'chief_and_above': 主任以上（chief, facility_admin, superuser）が閲覧可能
-- 'admin_only': 管理者のみ（facility_admin, superuser）が閲覧可能

-- 3. インデックスを追加
CREATE INDEX IF NOT EXISTS idx_meeting_minutes_access_level ON meeting_minutes(access_level);

-- 4. RLSポリシーを更新して主任ロールに対応
-- 既存のポリシーを削除して再作成

-- 会議議事録の閲覧ポリシー
DROP POLICY IF EXISTS "Users can view meeting minutes" ON meeting_minutes;

CREATE POLICY "Users can view meeting minutes" ON meeting_minutes
    FOR SELECT
    USING (
        -- 同じ施設のユーザーで、アクセスレベルに応じた閲覧権限を持つ
        facility_id IN (
            SELECT facility_id FROM profiles WHERE id = auth.uid()
        )
        AND (
            -- アクセスレベルチェック
            access_level = 'all'
            OR (
                access_level = 'chief_and_above' 
                AND EXISTS (
                    SELECT 1 FROM profiles 
                    WHERE id = auth.uid() 
                    AND role IN ('chief', 'facility_admin', 'superuser')
                )
            )
            OR (
                access_level = 'admin_only'
                AND EXISTS (
                    SELECT 1 FROM profiles 
                    WHERE id = auth.uid() 
                    AND role IN ('facility_admin', 'superuser')
                )
            )
        )
    );

-- 5. 主任ロールの権限説明コメント
COMMENT ON COLUMN profiles.role IS '
ユーザーロール:
- superuser: システム全体の管理者
- facility_admin: 施設管理者
- chief: 主任（幹部会議等の閲覧権限あり）
- approver: 承認者
- regular_user: 一般ユーザー
';

COMMENT ON COLUMN meeting_minutes.access_level IS '
議事録の閲覧制限レベル:
- all: すべてのユーザーが閲覧可能
- chief_and_above: 主任以上が閲覧可能
- admin_only: 管理者のみ閲覧可能
';