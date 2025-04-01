# データベースマイグレーション

このディレクトリには、データベースのマイグレーションスクリプトが含まれています。

## インデックス追加手順

### user_activity_logsテーブルのインデックス追加

`add_activity_logs_indexes.sql`には、メール送信制限機能のパフォーマンスを向上させるためのインデックス定義が含まれています。

#### 実行方法

1. Supabaseダッシュボードにログインする
2. SQL Editorタブを選択する
3. `add_activity_logs_indexes.sql`の内容をコピーして貼り付ける
4. Runボタンをクリックして実行する

または、Supabase CLIがインストールされている場合は、以下のコマンドを実行します：

```bash
supabase db execute -f migrations/add_activity_logs_indexes.sql
```

#### 追加されるインデックス

1. `idx_user_activity_logs_user_id_action_type`: ユーザーIDとアクションタイプの組み合わせ
2. `idx_user_activity_logs_action_type_created_at`: アクションタイプと作成日時
3. `idx_user_activity_logs_user_action_time`: ユーザーID、アクションタイプ、作成日時の組み合わせ
4. `idx_user_activity_logs_facility_id`: action_details内のfacility_idフィールドに対するGINインデックス
5. `idx_user_activity_logs_invited_email`: action_details内のinvited_emailフィールドに対するGINインデックス

#### パフォーマンスへの影響

これらのインデックスは、以下のクエリを高速化します：

1. ユーザーの時間あたり/日あたり/月あたりの招待数のカウント
2. 施設ごとの招待数のカウント
3. 特定のメールアドレスへの招待履歴の検索

これにより、メール送信制限機能のレスポンス時間が大幅に改善され、データベースへの負荷が軽減されます。

#### 注意事項

- インデックスはデータベースのパフォーマンスを向上させますが、インデックスのメンテナンスにもリソースが使用されます
- 特にGINインデックス（JSONBフィールド用）はサイズが大きくなる可能性があります
- 運用環境での影響を監視し、必要に応じてインデックスを調整することをお勧めします 