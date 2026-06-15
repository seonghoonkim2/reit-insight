# 로드맵 — DART 사업보고서 검색 사이트

> 목표: 한국 기업 사업보고서를 **자동 수집·정리·검색**하고, **부가가치(요약·지표·비교)** 를
> 더해 사람을 모은 뒤 **구글 애드센스**로 광고 수익을 내는 정보 사이트.

현재 위치: **0단계 + 부가가치/구조화 일부 완료**. 전체 설계는 [`ARCHITECTURE.md`](./ARCHITECTURE.md).
아래는 "취미 수준 → 실제 서비스"로 키우는 단계별 계획입니다. 입문자 기준으로 작게 쪼갰어요.

---

## 0단계 — POC (완료) ✅
- `collect.py`: OpenDART 자동 수집 + **정정→최신본 선택** + 섹션 경로 + **표 추출** + **증분 수집** + **SQLite 저장**(`db.py`)
- `summarize.py`: Claude API로 **요약·핵심지표 자동 추출**(원문 기반, 출처 표기)
- `web/index.html`: **공시렌즈 앱** — 홈/검색/회사/보고서/토픽, **문단 단위 검색** + 연도/섹션/숫자 필터,
  보고서 내 검색, **표 렌더링**, **전년 대비 변화**, 정정 배지, **광고 노출 규칙(`canShowAds`)** + 면책, 라이트 테마
- `build_site.py`: **SEO 정적 페이지**(회사/보고서/토픽) + canonical + **JSON-LD/OG** + **sitemap.xml** + robots.txt, Pages 배포 워크플로
- **검색 엔진**: SQLite **FTS5(trigram)** + `search.py`(BM25, 폴백 LIKE)
- **JSON API**: `api.py`(표준 라이브러리 HTTP) + `api/openapi.yaml`, `seed.py`로 키 없이 풀스택 체험
- **대량 수집**: `bulk.py`(작업 큐·하루 한도·이어하기), **재무 구조화** `financials.py`, **보고서 비교** `diff.py`

## 0.5단계 — 프로덕션 스택 (코드 완성 ✅, Docker/Node로 실행)
- **`backend/`**: PostgreSQL + **OpenSearch(nori 한국어 형태소)** + FastAPI — `docker compose up` 한 번,
  `load.py` 적재, OpenSearch 장애 시 Postgres 폴백. `api.py` 와 동일 엔드포인트.
- **`web-next/`**: **Next.js(App Router, TS) SSR/SEO** — 회사/보고서/키워드 서버 렌더 +
  generateMetadata·JSON-LD·sitemap·robots. 백엔드 API 호출.
## 0.6단계 — CI + 정정 버전 비교 (완료 ✅)
- **CI**(`.github/workflows/ci.yml`): 푸시/PR 시 셀프테스트·검색·SEO 생성·설정 유효성 자동 검증
  (frontend Next 빌드·backend Docker 빌드는 참고 잡)
- **정정 버전 보관**: `collect.py` 가 정정 그룹의 **모든 버전** 저장(대표본만 `is_latest_version`)
- **정정 전후 비교**: `GET /api/v1/group/{key}`·`/api/v1/diff?a=&b=`(stdlib·FastAPI 양쪽),
  SPA 보고서 화면의 "정정 이력 + 정정 전후 비교", Next.js `/diff` 페이지

## 0.7단계 — 배포(CD) + 실데이터 수집 자동화 (완료 ✅)
- **CD**(`cd.yml`): backend·web 이미지를 **GHCR에 자동 발행**(외부 시크릿 불필요), `deploy/docker-compose.prod.yml` 로 운영 실행
- **실데이터 수집**(`collect-data.yml`): GitHub 러너에서 OpenDART 실수집 → (선택)AI요약 → **GitHub Pages에 실데이터 사이트 배포** + reports.json 아티팩트
- 가이드: [`DEPLOY.md`](./DEPLOY.md)

- 다음: 자연어 QA(pgvector)·정기 자동수집 스케줄러(cron)·관리자/모니터링·애드센스 신청·요금제/Pro·인증 붙은 공개 API.

## 1단계 — 데이터 레이어 (전체 기업으로 확장)
- **전체 상장사 목록**: `corpCode` 전체를 받아 종목코드/회사명/섹터 매핑
- **저장소를 DB로 교체**: 처음엔 **SQLite**(파일 1개, 설치 간단) → 커지면 **PostgreSQL**
  - 테이블 예: `companies`(기업), `reports`(보고서 메타), `report_sections`(본문 섹션)
- **증분 수집**: 이미 받은 보고서는 건너뛰고, 새 공시만 추가 (접수번호 기준 중복 방지)
- **호출 한도 관리**: OpenDART 하루 한도에 맞춰 "하루 N개씩" 나눠 수집하는 큐/스케줄

## 2단계 — 검색 고도화
- **전문 검색 엔진** 도입으로 빠르고 정확한 전체 텍스트 검색
  - 입문 친화: **PostgreSQL Full-Text Search** (DB만으로 가능)
  - 본격: **Meilisearch**(설치·운영 쉬움, 한국어 양호) 또는 Elasticsearch
- **한국어 처리**: 형태소 분석(은전한닢/nori)으로 "배당"→"배당금/배당수익률"까지 잘 잡히게
- **검색 UX**: 자동완성, 섹터/연도 필터, 회사 내 보고서 연도 비교

## 3단계 — 부가가치 (애드센스 통과 + 사람 유입의 핵심) ⭐
> 원문만 복사하면 "스크랩 사이트"로 거부되니, **우리만의 가치**를 반드시 더해야 함.
- **AI 자동 요약**: 보고서 핵심을 3~5줄로 요약 (예: **Claude API**)
  - 섹션별 요약 → "이 회사가 무슨 사업을 하고, 올해 뭐가 달라졌는지" 한눈에
- **핵심 재무지표 자동 추출**: 매출/영업이익/순이익/부채비율 등
  - OpenDART **재무정보 API**(단일/다중회사 주요계정)로 숫자를 구조화 → 표/그래프
- **연도·기업 비교**: 같은 회사 3개년 추이, 동종업계 비교
- **쉬운 용어 풀이**: 어려운 회계·공시 용어에 마우스오버 설명
- **댓글/커뮤니티**(리츠 사이트에서 쌓은 노하우 재활용 가능)

## 4단계 — 자동화 (사람 손 안 가게)
- **스케줄러**로 정기 수집: `cron`(서버) 또는 **GitHub Actions**(서버 없이 무료 시간 내)
- **공시 모니터링**: 신규 사업보고서 공시 발생 시 자동으로 수집·요약·색인까지
- **실패 알림**: 수집 오류/한도 초과 시 알림(이메일/슬랙)

## 5단계 — 공개 & 수익화
- **호스팅 구조**
  - 프론트(검색 화면): 정적 호스팅(예: GitHub Pages/Netlify/Vercel)
  - 백엔드(검색 API+DB): 작은 서버/PaaS(예: Railway, Fly.io, 저렴한 VPS)
- **SEO**: 회사별/보고서별 페이지를 검색엔진이 잘 읽도록(메타태그, 사이트맵, 구조화 데이터)
- **애드센스 신청**: 부가가치(요약·지표)가 충분히 쌓인 뒤 신청 — *원문만 있는 상태로 신청 금지*
- **법적/약관 준수**
  - OpenDART **이용약관·출처표시**(금융감독원 DART) 준수
  - "정보 제공 목적, 투자 권유 아님" 명시
  - 개인정보/광고 정책(개인정보처리방침, 쿠키 동의 등)

---

## 추천 기술 스택 (입문자 기준)
| 영역 | 1차 추천(쉬움) | 확장 시 |
|---|---|---|
| 수집 | Python (지금 그대로) | Python + 작업 큐 |
| 저장 | SQLite | PostgreSQL |
| 검색 | Postgres FTS | Meilisearch |
| 요약/지표 | Claude API | + 자체 파이프라인 |
| 프론트 | 지금의 정적 HTML | Next.js 등 |
| 자동화 | GitHub Actions | 서버 cron |
| 호스팅 | Pages/Netlify + 작은 서버 | 클라우드 |

## 바로 다음에 할 만한 한 걸음
1. `collect.py` 의 `stock_codes` 를 10~20개로 늘려 실제로 돌려보기 (감 잡기)
2. 저장을 **SQLite** 로 바꿔 보고서 수십~수백 건을 담아보기
3. 보고서 1건에 **Claude API 요약**을 붙여 "부가가치"의 효과 체감하기

> 각 단계는 독립적으로 진행 가능합니다. 한 번에 다 하지 말고, 위에서부터 하나씩 같이 만들어가요.
