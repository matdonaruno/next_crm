-- トークン検証用のストアド関数
-- 招待トークン、使用状態、有効期限をチェックする関数
CREATE OR REPLACE FUNCTION check_invitation_token(token_param TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  invitation RECORD;
  facility_name TEXT;
  department_name TEXT;
  result jsonb;
BEGIN
  -- 有効な招待レコードを取得
  SELECT 
    i.*
  INTO invitation
  FROM user_invitations i
  WHERE i.invitation_token = token_param
    AND i.is_used = false
    AND i.expires_at > NOW();
    
  IF invitation IS NULL THEN
    -- トークンを別の方法でも試す（後方互換性のため）
    SELECT 
      i.*
    INTO invitation
    FROM user_invitations i
    WHERE position(token_param in i.invitation_token) > 0
      AND i.is_used = false
      AND i.expires_at > NOW();
      
    IF invitation IS NULL THEN
      RETURN NULL;
    END IF;
  END IF;
  
  -- 施設名を取得
  SELECT name INTO facility_name
  FROM facilities
  WHERE id = invitation.facility_id;
  
  -- 部門名を取得（存在する場合）
  IF invitation.department_id IS NOT NULL THEN
    SELECT name INTO department_name
    FROM departments
    WHERE id = invitation.department_id;
  END IF;
  
  -- 結果をJSONBに変換
  result = jsonb_build_object(
    'id', invitation.id,
    'email', invitation.email,
    'role', invitation.role,
    'facility', facility_name,
    'department', department_name,
    'expires_at', invitation.expires_at,
    'facility_id', invitation.facility_id,
    'department_id', invitation.department_id,
    'invited_by', invitation.invited_by
  );
  
  RETURN result;
END;
$$; 