-- ユーザーロールテーブル
CREATE TYPE user_role AS ENUM ('superuser', 'facility_admin', 'approver', 'regular_user');

-- プロファイルテーブルにロールカラムを追加（既存のテーブルを拡張）
ALTER TABLE IF EXISTS profiles 
ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'regular_user',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ユーザー招待テーブル
CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  facility_id UUID NOT NULL REFERENCES facilities(id),
  department_id UUID REFERENCES departments(id),
  role user_role NOT NULL DEFAULT 'regular_user',
  invitation_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  is_used BOOLEAN NOT NULL DEFAULT false
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_user_invitations_token ON user_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_user_invitations_facility ON user_invitations(facility_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ユーザーアクティビティログテーブル（招待登録、ロール変更など）
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action_type TEXT NOT NULL,
  action_details JSONB,
  performed_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_action ON user_activity_logs(action_type);

-- RLS(Row Level Security)ポリシー
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;

-- ロールに基づくRLSポリシー

-- スーパーユーザーはすべての招待を管理可能
CREATE POLICY superuser_manage_invitations ON user_invitations
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'superuser'));

-- 施設管理者は自分の施設の招待のみ管理可能
CREATE POLICY facility_admin_manage_invitations ON user_invitations
    USING (
      facility_id IN (
        SELECT facilities.id 
        FROM facilities 
        INNER JOIN profiles ON facilities.id = profiles.facility_id
        WHERE profiles.id = auth.uid() AND profiles.role = 'facility_admin'
      )
    );

-- ユーザーアクティビティログのポリシー
-- スーパーユーザーはすべてのログを閲覧可能
CREATE POLICY superuser_view_logs ON user_activity_logs
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'superuser'));

-- 施設管理者は自分の施設のユーザーのログのみ閲覧可能
CREATE POLICY facility_admin_view_logs ON user_activity_logs
    USING (
      user_id IN (
        SELECT auth.users.id
        FROM auth.users
        INNER JOIN profiles ON auth.users.id = profiles.id
        WHERE profiles.facility_id IN (
          SELECT facility_id
          FROM profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'facility_admin'
        )
      )
    );

-- ユーザーは自分のログのみ閲覧可能
CREATE POLICY user_view_own_logs ON user_activity_logs
    USING (user_id = auth.uid());

-- 通知関連テーブル
CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  notification_type TEXT NOT NULL,
  related_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_read ON user_notifications(is_read);

-- RLSポリシー
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分の通知のみ閲覧可能
CREATE POLICY user_view_own_notifications ON user_notifications
    USING (user_id = auth.uid());

-- スーパーユーザーはすべての通知を閲覧可能
CREATE POLICY superuser_view_notifications ON user_notifications
    USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'superuser')); 