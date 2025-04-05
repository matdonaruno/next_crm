-- ユーザーアクティビティログテーブルのRLS設定
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のログを読み取り可能
CREATE POLICY "ユーザーは自分のアクティビティログを読み取り可能"
ON user_activity_logs
FOR SELECT
USING (auth.uid() = user_id);

-- 認証されたユーザーはログを挿入可能
CREATE POLICY "認証ユーザーがアクティビティログを挿入可能"
ON user_activity_logs
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- ユーザーは自分のログを更新可能
CREATE POLICY "ユーザーは自分のアクティビティログを更新可能"
ON user_activity_logs
FOR UPDATE
USING (auth.uid() = user_id);

-- ユーザーは自分のログを削除可能
CREATE POLICY "ユーザーは自分のアクティビティログを削除可能"
ON user_activity_logs
FOR DELETE
USING (auth.uid() = user_id);

-- ユーザー通知テーブルのRLS設定
-- ユーザーは自分宛の通知を読み取り可能
CREATE POLICY "ユーザーは自分宛の通知を読み取り可能"
ON user_notifications
FOR SELECT
USING (auth.uid() = user_id);

-- すべてのユーザーが通知を挿入可能に
CREATE POLICY "すべてのユーザーが通知を挿入可能"
ON user_notifications
FOR INSERT
WITH CHECK (true);

-- 認証されたユーザーのみが挿入可能
CREATE POLICY "認証ユーザーが通知を挿入可能"
ON user_notifications
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- profilesテーブルのRLS設定
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のプロファイルを読み取り可能
CREATE POLICY "ユーザーは自分のプロファイルを読み取り可能"
ON profiles
FOR SELECT
USING (auth.uid() = id);

-- ユーザーは自分のプロファイルを更新可能
CREATE POLICY "ユーザーは自分のプロファイルを更新可能"
ON profiles
FOR UPDATE
USING (auth.uid() = id);

-- 認証されたユーザーは新規プロファイルを作成可能
CREATE POLICY "認証ユーザーは新規プロファイルを作成可能"
ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id); 