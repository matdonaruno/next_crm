-- meeting_typesテーブルにサンプルデータを挿入
INSERT INTO meeting_types (id, name, description, facility_id, created_at, updated_at)
VALUES 
  (gen_random_uuid(), '定例会議', '毎週行われる定例会議', NULL, now(), now()),
  (gen_random_uuid(), '全体会議', '全社員が参加する会議', NULL, now(), now()),
  (gen_random_uuid(), '部門会議', '各部門で行われる会議', NULL, now(), now()),
  (gen_random_uuid(), '臨時会議', '緊急性のある議題のための臨時会議', NULL, now(), now()),
  (gen_random_uuid(), '戦略会議', '経営戦略を議論する会議', NULL, now(), now());
