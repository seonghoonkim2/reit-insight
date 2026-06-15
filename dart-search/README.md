# 공시렌즈 (GongsiLens) — DART 사업보고서 전문 검색 (POC)

한국 기업들의 **DART 사업보고서**를 OpenDART 공식 API로 자동 수집·정리하고,
**문단 단위 전문 검색 · 회사/연도별 체계화 · 정정(최신본) 처리 · AI 요약**까지 제공하는
공시 리서치 검색엔진의 개념증명(POC)입니다.

> 📐 전체 설계(포지셔닝·아키텍처·DB 스키마·SEO·수익화·요금제)는 **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** 참고.

> ⚠️ **광고 수익이 목표라면** — 사업보고서 *원문만 그대로* 복사해 광고를 붙이면 구글 애드센스의
> "스크랩/중복 콘텐츠" 정책에 걸려 **승인 거부·계정 정지 위험**이 큽니다.
> 그래서 이 프로젝트는 **원문 + 검색 + 정리 + 비교 + 출처(부가가치형)** 로 설계했습니다.

> ⚠️ **면책**: 본 서비스는 금융감독원 전자공시시스템(DART)의 **공식 서비스가 아닙니다.**

---

## 폴더 구성

```
dart-search/
├─ collect.py            # OpenDART 수집(정정→최신본, 섹션경로, 표 추출, 증분, SQLite) — pip 불필요
├─ bulk.py               # 대량/재개형 수집(작업 큐 기반, 하루 한도) — pip 불필요
├─ summarize.py          # Claude API 요약·핵심지표 추출 — pip install anthropic
├─ financials.py         # OpenDART 재무 구조화(financial_facts) — pip 불필요
├─ db.py                 # SQLite 데이터 레이어 + FTS5 검색 인덱스 — pip 불필요
├─ search.py             # 전문검색 엔진(FTS5 trigram, 폴백 LIKE) — pip 불필요
├─ api.py                # 읽기 전용 JSON API(표준 라이브러리 HTTP) — pip 불필요
├─ seed.py               # 데모 데이터를 SQLite로 시드(키 없이 풀스택 체험) — pip 불필요
├─ build_site.py         # SEO 정적 사이트 생성(회사/보고서/토픽 + JSON-LD + sitemap) — pip 불필요
├─ diff.py               # 보고서 비교(전년대비/정정 전후) — pip 불필요
├─ api/openapi.yaml      # API 스펙(OpenAPI 3)
├─ ARCHITECTURE.md · ROADMAP.md · config.example.json
├─ web/  (index.html 검색앱 · demo-data.js · data.js[깃제외])
├─ data/ (reports.json · SQLite gongsilens.db · 캐시  — 깃제외)
└─ dist/ (build_site.py SEO 산출물 — 깃제외)
```
(배포: `.github/workflows/gongsilens-pages.yml` — Actions에서 수동 실행 시 `web/`를 GitHub Pages에 게시)

### 🚀 키 없이 풀스택 바로 체험 (데모 데이터)
```bash
python3 seed.py                 # 데모를 SQLite로 적재(+FTS 인덱스)
python3 search.py 우발부채        # 전문검색(한국어 부분일치)
python3 search.py PF             # 짧은 영문은 LIKE 폴백
python3 api.py                  # http://127.0.0.1:8765/api/v1/search?q=우발부채
```

### 대량 수집 (실데이터, 키 필요)
```bash
python3 bulk.py                 # 상장사를 큐에 넣고 하루 한도만큼 처리(이어하기 가능)
python3 bulk.py --status        # 큐 현황
```

### 프로덕션 스택 (확장 — Docker / Node)
경량 무설치 경로(`api.py` + `web/index.html`) 외에, 대규모 운영용 풀스택도 포함되어 있습니다.
- **`backend/`** — PostgreSQL + OpenSearch(nori 한국어 형태소) + FastAPI. `docker compose up` 으로 기동.
- **`web-next/`** — Next.js(App Router, TS) SSR/SEO 프런트엔드. 백엔드 API 호출.
```bash
cd backend && docker compose up -d --build && docker compose run --rm backend python load.py
cd ../web-next && cp .env.example .env.local && npm install && npm run dev   # http://localhost:3000
```
자세한 건 `backend/README.md`, `web-next/README.md` 참고.

### 배포 & 실데이터 수집
👉 **[`DEPLOY.md`](./DEPLOY.md)** — GitHub Actions로 OpenDART **실수집→Pages 배포**(로컬 PC 불필요),
GHCR 이미지 자동 발행(CD), `docker-compose.prod.yml` 운영 실행까지 한 곳에 정리.

### CI & 정정 전후 비교
- **CI**: 푸시/PR마다 `.github/workflows/ci.yml` 가 셀프테스트·검색·SEO·설정 유효성을 자동 검증합니다.
- **정정 버전**: `collect.py` 가 정정 그룹의 모든 버전을 저장 → `GET /api/v1/group/{key}`·`/api/v1/diff?a=&b=`,
  SPA 보고서 화면의 "정정 이력 + 정정 전후 비교", Next.js `/diff` 페이지에서 확인.

**검색 앱 화면(해시 라우팅):** 홈(`#/`) · 검색(`#/search?q=`) · 회사(`#/company/<코드>`) ·
보고서(`#/filing/<접수번호>`) · 토픽(`#/topic/<키워드>`)
회사 페이지에는 **전년 대비 변화**(새 섹션·키워드 증감), 보고서에는 **표 렌더링**·보고서 내 검색이 들어갑니다.

---

## 1단계 — 키 없이 먼저 화면 구경하기 (지금 바로 가능)

`web/index.html` 을 더블클릭해 브라우저로 열어보세요.
**데모 샘플**로 검색·상세보기·강조표시가 어떻게 동작하는지 바로 볼 수 있습니다.
(검색창에 `반도체`, `백신` 등을 입력해 보세요.)

## 2단계 — 실제 데이터 수집하기

### (1) OpenDART 인증키 발급 — *직접 하셔야 해요 (무료)*
1. https://opendart.fss.or.kr 접속 → **인증키 신청/관리** → 이메일로 회원가입
2. 발급받은 **인증키(40자리 영숫자)** 를 복사

### (2) 설정 파일 만들기
`config.example.json` 을 같은 폴더에 **`config.json`** 으로 복사한 뒤 값을 채웁니다.

```json
{
  "api_key": "여기에_발급받은_인증키",
  "stock_codes": ["005930", "000660", "035420"],
  "years_back": 3
}
```
- `stock_codes`: 수집할 종목코드(6자리). 예) 005930 삼성전자, 000660 SK하이닉스, 035420 NAVER
- 처음엔 2~3개만 넣어 가볍게 시험해 보세요.

### (3) 수집 실행
```bash
python3 collect.py
```
끝나면 `web/data.js` 가 생기고, `web/index.html` 을 새로고침하면 **실제 사업보고서**가 검색됩니다.

> 💡 인증키 없이 텍스트 추출 로직만 점검: `python3 collect.py --selftest`

## 3단계 — AI 부가가치 붙이기 (요약·핵심지표) ⭐

원문만 있으면 애드센스에서 "스크랩 사이트"로 거부될 수 있어요. **우리만의 가치**를 더하는 단계입니다.

### (1) 준비
```bash
pip install anthropic
```
- Claude(Anthropic) API 키 발급: https://console.anthropic.com → API Keys
- `config.json` 의 `anthropic_api_key` 에 넣거나 환경변수 `ANTHROPIC_API_KEY` 로 설정

### (2) 실행
```bash
python3 summarize.py
```
- `collect.py` 로 모은 보고서마다 **3~5문장 요약 + 사업 설명 + 핵심 포인트 + (찾으면)매출/영업이익/순이익**을 자동 생성해 `web/data.js` 에 채워 넣습니다.
- 이미 요약된 보고서는 건너뛰어 **재실행 비용을 아낍니다.**

> 💡 키 없이 어떤 프롬프트가 가는지 미리보기(요금 0): `python3 summarize.py --dry-run`
> 💡 비용을 줄이려면 `config.json` 의 `summary_model` 을 `claude-haiku-4-5` 로 바꿔도 됩니다(품질↔비용은 본인 선택).

---

## 4단계 — SEO 정적 페이지 생성 & 배포 (선택)
검색엔진이 잘 읽도록 회사/보고서/토픽 페이지를 정적 HTML로 발행합니다.
```bash
python3 build_site.py                              # dist/ 에 생성 (데이터 없으면 데모로 생성)
python3 build_site.py --base-url https://내도메인  # sitemap 절대경로
```
- 결과: `dist/index.html`, `dist/company/*`, `dist/filing/*`, `dist/topic/*`, `dist/sitemap.xml`, `dist/robots.txt`
- **배포**: 저장소 Settings → Pages → Source를 "GitHub Actions"로 둔 뒤, Actions 탭에서
  `GongsiLens Pages (manual)` 워크플로를 실행하면 `web/`(검색 앱 데모)가 게시됩니다.

---

## 점검 명령 (인증키/네트워크 없이 동작)
```bash
python3 collect.py --selftest     # 텍스트/표 추출
python3 db.py --selftest          # SQLite 스키마/업서트/FTS/작업큐/재무
python3 financials.py --selftest  # 재무 응답 파싱
python3 diff.py --selftest        # 보고서 비교(전년대비/정정)
python3 bulk.py --selftest        # 대량 수집 큐/재개/중복방지
python3 summarize.py --dry-run    # AI 요약 프롬프트 미리보기
python3 seed.py && python3 search.py 우발부채   # 시드 + 검색
python3 build_site.py             # SEO 정적 페이지 생성(데모 데이터)
```

## 주의사항
- **인증키(`config.json`)·SQLite(`data/`)는 깃에 올리지 마세요.** `.gitignore` 로 자동 보호됩니다.
- OpenDART 는 **하루 호출 한도**가 있어, "모든 기업"은 한 번에 못 받고 나눠서 수집해야 합니다.
- 데이터 출처는 반드시 **금융감독원 DART** 로 표기하고, 정보 제공 목적·비공식임을 명시하세요.

## 다음 단계
👉 단계별 계획은 **[`ROADMAP.md`](./ROADMAP.md)**, 전체 설계는 **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** 참고.
요약: SQLite→PostgreSQL · 전문검색 엔진(OpenSearch)·한국어 형태소 · Next.js SSR/SEO(sitemap·canonical) ·
표 파싱·재무 구조화 · 전년대비/정정 diff · 정기 자동수집 · 애드센스 신청 · 요금제/API.
