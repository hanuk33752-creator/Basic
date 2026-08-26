-- 서술형 문제 출제·채점 앱 스키마 (스펙 3장)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 3.1 자격증 팩
CREATE TABLE IF NOT EXISTS cert_pack (
  pack_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  is_active  INTEGER NOT NULL DEFAULT 0,   -- 0/1, 활성 팩은 항상 최대 1개
  created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 3.2 문제
CREATE TABLE IF NOT EXISTS question (
  question_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_id        INTEGER NOT NULL REFERENCES cert_pack(pack_id) ON DELETE CASCADE,
  question_text  TEXT    NOT NULL,
  year_round     TEXT,                       -- 연도/회차 (선택)
  max_score      REAL    NOT NULL DEFAULT 5, -- 배점 5점 고정
  required_count INTEGER,                    -- N. "n가지 서술" 패턴이 없으면 NULL
  created_at     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_question_pack ON question(pack_id);

-- 3.3 참고자료 (백데이터)
CREATE TABLE IF NOT EXISTS reference_material (
  reference_id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id  INTEGER NOT NULL REFERENCES question(question_id) ON DELETE CASCADE,
  source_text  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reference_question ON reference_material(question_id);

-- 3.4 키워드 그룹
--  - N이 있는 문제: 그룹 하나 = 정답으로 인정되는 항목 하나 (group_index 0..N-1)
--  - N이 없는 문제: group_index = 0 인 단일 행에 flat 키워드 목록 저장
CREATE TABLE IF NOT EXISTS keyword_group (
  group_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id  INTEGER NOT NULL REFERENCES question(question_id) ON DELETE CASCADE,
  group_index  INTEGER NOT NULL,
  label        TEXT,                 -- 항목 이름 (예: "폭기조 용존산소 부족")
  keywords     TEXT    NOT NULL,     -- JSON 배열 문자열
  is_flat      INTEGER NOT NULL DEFAULT 0,
  -- 1이면 '필수 항목'. 반드시 인정되어야 하며, 나머지 선택 항목은 (N - 필수 수)개까지만 인정된다.
  is_required  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_kwgroup_question ON keyword_group(question_id);

-- 3.5 시도 기록
CREATE TABLE IF NOT EXISTS attempt (
  attempt_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id    INTEGER NOT NULL REFERENCES question(question_id) ON DELETE CASCADE,
  answer_text    TEXT    NOT NULL,
  score          REAL    NOT NULL,   -- 0~5, 0.5 단위
  ratio          REAL    NOT NULL,   -- 매칭 비율 0~1
  verdict        TEXT    NOT NULL,   -- 'O' | 'TRIANGLE' | 'X'
  matched_groups TEXT    NOT NULL,   -- JSON 배열
  missing_groups TEXT    NOT NULL,   -- JSON 배열
  feedback       TEXT,
  graded_by      TEXT    NOT NULL DEFAULT 'claude', -- 'claude' | 'local'
  submitted_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_attempt_question ON attempt(question_id);
CREATE INDEX IF NOT EXISTS idx_attempt_time ON attempt(submitted_at);
