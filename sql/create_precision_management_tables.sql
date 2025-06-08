-- 精度管理記録データベースのテーブル作成

-- 部署テーブル
CREATE TABLE IF NOT EXISTS departments (
    department_id SERIAL PRIMARY KEY,
    department_name TEXT NOT NULL
);

-- 機器テーブル
CREATE TABLE IF NOT EXISTS equipments (
    equipment_id SERIAL PRIMARY KEY,
    equipment_name TEXT NOT NULL,
    department_id INTEGER REFERENCES departments(department_id)
);

-- 実施タイミングテーブル
CREATE TABLE IF NOT EXISTS implementation_timings (
    timing_id SERIAL PRIMARY KEY,
    timing_name TEXT NOT NULL
);

-- 精度管理記録テーブル
CREATE TABLE IF NOT EXISTS precision_management_records (
    record_id SERIAL PRIMARY KEY,
    department_id INTEGER REFERENCES departments(department_id),
    equipment_id INTEGER REFERENCES equipments(equipment_id),
    implementation_date DATE NOT NULL,
    implementer TEXT NOT NULL,
    timing_id INTEGER REFERENCES implementation_timings(timing_id),
    implementation_count INTEGER NOT NULL,
    error_count INTEGER NOT NULL,
    shift_trend BOOLEAN NOT NULL DEFAULT FALSE,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_pmr_department_id ON precision_management_records(department_id);
CREATE INDEX IF NOT EXISTS idx_pmr_equipment_id ON precision_management_records(equipment_id);
CREATE INDEX IF NOT EXISTS idx_pmr_implementation_date ON precision_management_records(implementation_date);
CREATE INDEX IF NOT EXISTS idx_equipment_department_id ON equipments(department_id);

-- 部署サンプルデータ
INSERT INTO departments (department_id, department_name) VALUES
(1, '血液ガス'),
(2, '一般'),
(3, '生化学免疫'),
(4, '輸血'),
(5, '血液'),
(6, '病理'),
(7, '微生物')
ON CONFLICT (department_id) DO NOTHING;

-- 機器サンプルデータ
INSERT INTO equipments (equipment_id, equipment_name, department_id) VALUES
(1, 'ABL90（LABO）', 1),
(2, 'ABL90（NICU）', 1),
(3, 'Atellica1500', 2),
(4, 'アドバンタス', 2),
(5, 'TBA-120FR', 3),
(6, 'TBA2000FR', 3),
(7, 'I2000SR', 3),
(8, 'コバスe602', 3),
(9, 'G1200', 3),
(10, 'GA-1172', 3),
(11, 'HA-8190V', 3),
(12, 'Wadiana', 4),
(13, 'XN3100（L）', 5),
(14, 'XN3100（R）', 5),
(15, 'CN6000', 5),
(16, 'SP-50', 5),
(17, '血沈1号機', 5),
(18, '血沈2号機', 5),
(19, 'HE染色', 6),
(20, 'Pap染色', 6),
(21, 'WalkAwayQC', 7),
(22, 'SARS-PCR', 7),
(23, 'WalkAWAY PC1J', 7),
(24, 'WalkAWAY EN2J', 7),
(25, 'WalkAWAY NF2J', 7)
ON CONFLICT (equipment_id) DO NOTHING;

-- 実施タイミングサンプルデータ
INSERT INTO implementation_timings (timing_id, timing_name) VALUES
(1, '始業時'),
(2, '試薬補充・校正実施後'),
(3, '試薬交換後'),
(4, '午後'),
(5, 'メンテナンス後'),
(6, 'その他')
ON CONFLICT (timing_id) DO NOTHING;

-- 精度管理記録サンプルデータ
INSERT INTO precision_management_records 
(record_id, department_id, equipment_id, implementation_date, implementer, timing_id, implementation_count, error_count, shift_trend, remarks) VALUES
(1, 1, 1, '2025-04-11', '山田太郎', 1, 5, 0, FALSE, 'なし'),
(2, 3, 5, '2025-04-11', '鈴木花子', 2, 8, 1, TRUE, '試薬ロット変更後、一時的にコントロール値の上昇あり'),
(3, 5, 13, '2025-04-11', '佐藤次郎', 4, 6, 0, FALSE, 'なし')
ON CONFLICT (record_id) DO NOTHING; 