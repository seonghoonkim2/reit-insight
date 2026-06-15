# 공시렌즈 (GongsiLens) — 아키텍처 & 단계 계획

> DART 사업보고서를 회사별·연도별·섹션별로 자동 수집·정리하고, **문단 단위 전문 검색 ·
> 비교 · 요약**까지 제공하는 공시 리서치 검색엔진.
> (외부 기획안 "공시렌즈"의 방향을 수용해 정리한 확정 문서)

- 제품명(가칭): **공시렌즈 / GongsiLens**
- 폴더: 이 저장소의 `dart-search/`
- ⚠️ **면책**: 본 서비스는 금융감독원 전자공시시스템(DART)의 **공식 서비스가 아닙니다.**
  공시 원문 출처는 DART이며, 정보 제공 목적일 뿐 투자 권유가 아닙니다.

---

## 0. 핵심 원칙 (왜 이렇게 만드는가)

원문만 복사해 광고를 붙이면 → 구글 애드센스 "스크랩/저가치 콘텐츠"로 거부·정지 위험 + 검색 중복.
따라서 **사용자가 보는 페이지 = 원문 + 정리 + 비교 + 검색 + 출처**가 되어야 한다.

우리만의 가치 8가지:
1. 빠른 전문 검색(문단 단위)  2. 회사·연도별 체계화  3. 목차/섹션 분리
4. 전년 대비 변화 비교  5. 정정 전후 비교  6. 키워드별 기업 모음
7. DART 원문 출처 링크  8. AI 요약(원문 근거 링크 연결)

---

## 1. 핵심 사용자 & 검색 의도

| 사용자 | 대표 검색어 | 필요 기능 |
|---|---|---|
| 취준생 | 삼성전자 사업보고서, 사업의 내용 | 사업 요약, 사업부 정리, 경쟁사 비교 |
| 개인투자자 | 우발부채, 배당정책, 소송, 계속기업 불확실성 | 리스크 문단 검색, 전년 대비 변경, 정정 알림 |
| 기자/블로거 | 정정 사업보고서, PF 우발채무, 임원 보수 | 전체 회사 검색, 키워드 증가 랭킹, 원문 인용 |
| 실무자 | 동종업계, 리스부채, 특수관계자 거래, 책임준공 | 섹션 검색, 다회사 비교, 표 CSV, API |

---

## 2. 데이터 흐름

```
OpenDART API
  → 회사코드 동기화(corpCode)
  → 공시검색(사업보고서 rcept_no 수집, 정정 포함)
  → 원문 ZIP 다운로드 → XML 압축해제
  → 본문/표/목차 파싱 → 섹션 단위 저장
  → 문단(chunk) 생성 → 검색 인덱싱
  → 회사/보고서/키워드/산업 페이지 발행
  → (선택) AI 요약·비교 생성(원문 근거 링크 포함)
```

## 3. 목표 아키텍처 (단계적으로 도달)

```
User ─ Next.js(Frontend, SSR/SSG) ─ Backend API(FastAPI/NestJS)
                                       ├─ PostgreSQL  (메타데이터)
                                       ├─ OpenSearch  (전문 검색)
                                       └─ Redis       (캐시)
Python Workers ─ OpenDART ─ Object Storage(원문) / PostgreSQL / OpenSearch
```

| 영역 | 1차(지금/곧) | 확장 |
|---|---|---|
| 저장 | **SQLite**(`db.py`) | PostgreSQL |
| 검색 | 클라이언트 문단검색 → Postgres FTS | OpenSearch/Elasticsearch |
| 프론트 | **정적 단일 페이지**(빌드 없음) | Next.js(SSR/SSG, 회사·보고서·키워드 페이지) |
| 수집 | `collect.py`(표준 라이브러리) | 워커 + 큐(Celery/RQ) |
| 요약 | `summarize.py`(Claude API) | 배치/우선순위 큐 |
| 호스팅 | 정적 + 작은 서버 | 클라우드 |

> **현재 구현 상태**: 1차 컬럼만 구현. 풀스택은 검색 유입·수요를 검증한 뒤 단계적으로 전환.

---

## 4. DB 스키마 (핵심 테이블 — `db.py`에 1차 구현)

지금 SQLite에 구현하는 1차 테이블: `companies`, `filings`, `filing_sections`, (선택)`filing_chunks`.
확장 시 추가: `filing_tables`, `financial_facts`, `ingestion_jobs`, `parser_errors`,
`search_events`, `ai_summaries`, `keyword_stats`.

핵심 컬럼 요지:
- **filings**: `rcept_no`(고유), `corp_code`, `report_type`, `business_year`,
  `rcept_dt`, `is_amended`, `amendment_type`, `is_latest_version`,
  **`filing_group_key`**, `dart_viewer_url`, `parse_status`.
- **filing_sections**: `filing_id`, `section_path`, `section_title`, `section_level`,
  `section_order`, `clean_text`, `text_hash`.
- **filing_chunks**(검색 최소 단위): `section_id`, `chunk_text`, `has_table`, `has_number`,
  `token_count`, (`embedding` — pgvector 확장 시).

### 정정 보고서 처리 (중요)
DART는 정정이 잦다. `rcept_no` 단건 저장만으론 부족 → **그룹 키**로 묶는다.
```
filing_group_key = corp_code + report_type + business_year
```
대표본(`is_latest_version=true`) 선택: 철회 제외 → 같은 그룹 내 최신 접수일 → 기재정정 우선.
화면엔 "최신본 / 최초 제출 / 정정 이력 N건"을 함께 표기한다.

---

## 5. 검색 설계

- **검색 단위 = 보고서 전체가 아니라 문단(chunk).** 사업보고서는 너무 길다.
- 랭킹: `BM25 본문 관련도 + 회사명/종목코드 exact boost + 섹션제목 boost + 최신본 boost +
  최근연도 boost + 클릭 인기도`.
- 필터: 회사/종목코드/시장/사업연도/보고서종류/섹션/최신본만/정정포함/표포함/숫자포함.
- 모드: (MVP) 정확검색·필터·보고서 내 검색·하이라이트 → (고도화) 유사어·자연어 질의·전년대비·동일문구 등장 회사.

---

## 6. 핵심 페이지 & URL

| 페이지 | URL(목표) | 핵심 |
|---|---|---|
| 홈 | `/` | 검색창 + 인기검색어 + 최근 업데이트 + 토픽 카드 |
| 검색결과 | `/search?q=&year=&sec=` | 문단 카드(회사·연도·섹션경로·snippet·DART링크) |
| 회사 | `/company/005930` | 연도별 보고서, 빠른 키워드, 재무지표, 전년대비 변화 |
| 보고서 | `/company/005930/annual-report/2025` | 목차 sticky, 보고서 내 검색, 섹션 원문, 요약, DART링크 |
| 키워드 | `/topics/우발부채` | 등장 보고서 모음 + 회사별 빈도 + 섹션 분포(자체 통계) |
| 산업 | `/sectors/construction` | 산업별 키워드·증가기업·관련 문단 |

> 현재 POC는 위 구조를 **해시 라우팅**(`#/company/...`, `#/filing/...`, `#/topic/...`)으로 시연.
> SEO용 정적/SSR 페이지·sitemap·canonical은 데이터가 쌓인 뒤 Next.js 단계에서 발행.

---

## 7. SEO 정책 (Next.js 단계)
- **인덱싱**: 회사/최신본 보고서/키워드/산업 페이지.
- **noindex**: 빈 검색결과, 무한 필터조합, raw XML/text, 파싱실패, 구버전 대표성 낮은 페이지.
- **canonical**: 최신본 보고서 페이지를 대표 URL로. 구버전은 정정이력에서 접근(검토 후 noindex).
- **sitemap**: 홈/회사/최신본 보고서/키워드/산업 페이지만.

---

## 8. 수익화 (AdSense)
- **AdSense**(운영자 광고수익) ≠ Google Ads(광고주 집행). 우리가 붙이는 건 AdSense.
- 광고 가능: 홈, 회사, 보고서(목차/요약/검색/비교 포함 시), 키워드/산업(자체 통계 포함 시).
- 광고 금지: raw 페이지, 로딩/에러/빈결과, 관리자, **원문만 있고 자체 설명 없는 페이지**.
- 노출 판단은 `canShowAds()`로 코드화(품질점수<60·빈결과·raw·error면 미노출). POC에 반영됨.
- 수익식: `월수익 = 월PV ÷ 1000 × Page RPM`. 광고만으론 한계 → 로그인·알림·Excel·비교·API·Pro로 확장.

### 요금제(향후)
- 무료: 회사별 검색, 원문 보기, 기본 필터, 최근 3개년, DART 링크.
- 로그인 무료: 관심회사·검색어 저장, 북마크, 일부 알림.
- Pro: 전체 연도, 전년대비/정정 diff, 표 CSV, 다회사 비교, 키워드 알림, AI QA, 광고 제거.
- API: `/api/v1/filings/search`, `/api/v1/company/{code}/annual-reports` 등.

---

## 9. AI 원칙
- AI는 원문을 **대체하지 않는다.** 더 빨리 찾게/요약/전년대비 정리하는 보조.
- **반드시 원문 출처(섹션 경로) 표기**, 투자의견 생성 금지, 사실 요약과 해석 구분.
- 전량 요약 X → 우선순위: 대형주 > 검색 유입 많은 회사 > 열람 보고서 > 광고수익 페이지 > Pro 요청.

---

## 10. 디자인
- 톤: "네이버 검색 + Bloomberg Lite + 리서치 노트". 너무 무겁지도 블로그스럽지도 않게.
- 라이트 테마: 흰 배경 / 네이비 텍스트 / 회색 라인 / 깔끔한 표 / 숫자 우측정렬 / DART 링크 상시 노출 /
  AI 요약은 원문과 시각적으로 구분. (디자인 토큰은 `web/index.html` `:root`에 반영)

---

## 11. 지금 구현 vs 다음 단계 (요약)

**지금(POC에 반영 완료)**
- 브랜딩 공시렌즈 + 면책문구 + 라이트 테마
- 문단 단위 검색 + 연도/섹션/숫자포함 필터 + 보고서 내 검색
- 회사·연도별 체계화(회사 페이지) + **전년 대비 변화**(새 섹션·키워드 증감) + 토픽 페이지(키워드 빈도)
- 정정(최신본) 처리: `filing_group_key`, `is_latest_version`, 정정 배지
- **표 추출**(collect.py) + 뷰어 표 렌더링
- **증분 수집**(이미 받은 보고서 건너뛰기)
- 광고 노출 규칙(`canShowAds`) + 광고 슬롯 placeholder
- SQLite 데이터 레이어(`db.py`) + collect.py 연동
- **전문검색 엔진**: SQLite **FTS5(trigram=한국어 부분일치)** + `search.py`(BM25, 폴백 LIKE)
- **읽기 전용 JSON API**(`api.py`, 표준 라이브러리 HTTP) + **OpenAPI 스펙**(`api/openapi.yaml`)
- **대량/재개형 수집**(`bulk.py`): 작업 큐(`ingestion_jobs`) + 하루 한도 + 중복방지 + 이어하기
- **재무 구조화**(`financials.py`, `financial_facts`): OpenDART 재무 API 파싱/저장
- **보고서 비교**(`diff.py`): 전년대비/정정 전후(새 섹션·변경률·키워드 증감)
- **SEO 정적 생성기**(`build_site.py`): 회사/보고서/토픽 + canonical + **JSON-LD(Article/Organization/Breadcrumb)** + OG/twitter + sitemap.xml + robots.txt
- 광고 노출 규칙(`canShowAds`) + **AdSense 실연동 훅**(ADSENSE_CLIENT 설정 시 활성)
- `seed.py`(키 없이 풀스택 체험) + GitHub Pages 배포 워크플로(수동)

**다음 단계**
- SQLite FTS5 → PostgreSQL FTS/OpenSearch, 한국어 형태소(nori)
- Next.js SSR/SSG로 전환(현재 정적 생성기 → 동적 라우팅·증분 빌드)
- ✅ 정정 전후 diff + **버전 보관** 연결 완료(collect 가 전 버전 저장, `/api/v1/diff`·SPA·Next `/diff`)
- ✅ CI(`.github/workflows/ci.yml`); 다음은 실제 CD(호스팅 시크릿 필요)
- 자연어 QA(pgvector)
- 정기 자동 수집(스케줄러) + 관리자 대시보드 + 모니터링 + CSV/Excel export
- 애드센스 신청 + 요금제/Pro + 인증·과금이 붙은 공개 API

**프로덕션 스택 (코드 완성 — Docker/Node 로 실행)**
- `backend/` — **PostgreSQL + OpenSearch(nori 한국어 형태소) + FastAPI**.
  `docker compose up` 한 번으로 기동, `load.py` 로 적재. OpenSearch 장애 시 Postgres(trgm/tsvector) 폴백.
  엔드포인트는 `api.py`/`api/openapi.yaml` 과 동일.
- `web-next/` — **Next.js(App Router, TypeScript) SSR/SEO 프런트엔드**.
  회사/보고서/키워드 페이지 서버 렌더 + `generateMetadata`·JSON-LD·`sitemap.ts`·`robots.ts`.
  백엔드 API(`NEXT_PUBLIC_API_BASE`)를 호출.
- 흐름: `collect.py`(수집) → `backend/load.py`(Postgres+OpenSearch 적재) → `web-next`(SSR) → 공개.
  무설치 경량 경로(`api.py` + `web/index.html`)는 그대로 유지되어 개발/데모용으로 병행 가능.
