-- 공시렌즈 PostgreSQL 스키마 (백엔드: Postgres + OpenSearch)
-- docker-compose 의 postgres 컨테이너 최초 기동 시 자동 적용됩니다.

CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- 한국어 부분일치(트라이그램) 보조 검색용

CREATE TABLE IF NOT EXISTS companies (
  corp_code     VARCHAR(8) PRIMARY KEY,
  stock_code    VARCHAR(6),
  corp_name     TEXT NOT NULL,
  corp_eng_name TEXT,
  market        TEXT,
  modify_date   TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_companies_stock ON companies(stock_code);
CREATE INDEX IF NOT EXISTS idx_companies_name_trgm ON companies USING gin (corp_name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS filings (
  rcept_no          VARCHAR(14) PRIMARY KEY,
  corp_code         VARCHAR(8) NOT NULL,
  stock_code        VARCHAR(6),
  corp_name         TEXT NOT NULL,
  report_nm         TEXT NOT NULL,
  report_type       TEXT,
  business_year     INT,
  rcept_dt          TEXT,
  is_amended        BOOLEAN DEFAULT FALSE,
  amendment_type    TEXT,
  is_latest_version BOOLEAN DEFAULT TRUE,
  filing_group_key  TEXT,
  dart_viewer_url   TEXT,
  char_count        INT,
  parse_status      TEXT DEFAULT 'parsed',
  updated_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_filings_corp   ON filings(corp_code);
CREATE INDEX IF NOT EXISTS idx_filings_year   ON filings(business_year);
CREATE INDEX IF NOT EXISTS idx_filings_group  ON filings(filing_group_key);
CREATE INDEX IF NOT EXISTS idx_filings_latest ON filings(is_latest_version);

CREATE TABLE IF NOT EXISTS filing_sections (
  id            BIGSERIAL PRIMARY KEY,
  rcept_no      VARCHAR(14) NOT NULL REFERENCES filings(rcept_no) ON DELETE CASCADE,
  section_order INT,
  section_path  TEXT,
  section_title TEXT,
  clean_text    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sections_rcept ON filing_sections(rcept_no);

-- 검색 최소 단위(문단). OpenSearch 가 주 검색엔진, Postgres FTS/trgm 은 폴백.
CREATE TABLE IF NOT EXISTS filing_chunks (
  id            BIGSERIAL PRIMARY KEY,
  rcept_no      VARCHAR(14) NOT NULL REFERENCES filings(rcept_no) ON DELETE CASCADE,
  corp_code     VARCHAR(8),
  corp_name     TEXT,
  business_year INT,
  section_title TEXT,
  section_path  TEXT,
  chunk_order   INT,
  text          TEXT NOT NULL,
  has_number    BOOLEAN DEFAULT FALSE,
  text_tsv      tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(text,''))) STORED
);
CREATE INDEX IF NOT EXISTS idx_chunks_rcept ON filing_chunks(rcept_no);
CREATE INDEX IF NOT EXISTS idx_chunks_year  ON filing_chunks(business_year);
CREATE INDEX IF NOT EXISTS idx_chunks_tsv   ON filing_chunks USING gin (text_tsv);
CREATE INDEX IF NOT EXISTS idx_chunks_trgm  ON filing_chunks USING gin (text gin_trgm_ops);

CREATE TABLE IF NOT EXISTS financial_facts (
  id            BIGSERIAL PRIMARY KEY,
  corp_code     VARCHAR(8),
  stock_code    VARCHAR(6),
  business_year INT,
  fs_div        TEXT,
  sj_div        TEXT,
  account_nm    TEXT,
  amount        TEXT,
  source_rcept_no VARCHAR(14),
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ff_corp_year ON financial_facts(corp_code, business_year);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id          BIGSERIAL PRIMARY KEY,
  job_type    TEXT NOT NULL,
  ref         TEXT,
  status      TEXT NOT NULL DEFAULT 'queued',
  payload     JSONB,
  error       TEXT,
  retry_count INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (job_type, ref)
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON ingestion_jobs(status);

-- 상장리츠(REIT)
CREATE TABLE IF NOT EXISTS reits (
  ticker          VARCHAR(6) PRIMARY KEY,
  name            TEXT,
  sector          TEXT,
  market          TEXT,
  price           TEXT,
  market_cap      TEXT,
  dividend_yield  TEXT,
  dividend_freq   TEXT,
  nav_ratio       TEXT,
  amc             TEXT,
  listing_date    TEXT,
  credit_rating   TEXT,
  portfolio       JSONB,
  summary         TEXT,
  key_points      JSONB,
  corp_code       VARCHAR(8),
  homepage        TEXT,
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reits_sector ON reits(sector);

-- 리츠 발행 채권
CREATE TABLE IF NOT EXISTS bonds (
  isin            VARCHAR(20) PRIMARY KEY,
  bond_name       TEXT,
  issuer          TEXT,
  issuer_code     VARCHAR(6),
  bond_type       TEXT,
  coupon_rate     TEXT,
  interest_type   TEXT,
  coupon_freq     TEXT,
  issue_date      TEXT,
  maturity_date   TEXT,
  issue_amount    TEXT,
  outstanding     TEXT,
  seniority       TEXT,
  guaranteed      TEXT,
  credit_rating   TEXT,
  listed          TEXT,
  summary         TEXT,
  key_points      JSONB,
  source_url      TEXT,
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bonds_issuer_code ON bonds(issuer_code);
CREATE INDEX IF NOT EXISTS idx_bonds_maturity ON bonds(maturity_date);
