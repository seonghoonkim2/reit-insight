# 저장소 안내 (reit-insight)

한 저장소에 세 프로젝트가 있습니다. **현재 주력은 ① 모델터**이며, 보호된 master에 PR이 머지되면 Cloudflare Worker가 modelter.com에 자동 배포합니다.

| 프로젝트 | 위치 | 상태 |
|---|---|---|
| ① 모델터 (Modelter) | `dart-search/web/modelter/` + `worker.js` + `wrangler.toml` | **주력 · 라이브(modelter.com)** |
| ② 리츠인사이트 | 루트 `index.html` | 초기 데모 (상장리츠 정보+댓글, localStorage) |
| ③ 공시렌즈 (GongsiLens) | `dart-search/` (collect.py·db.py·web/index.html) | 독립 하위 프로젝트 — `dart-search/ARCHITECTURE.md` 참고 |

## ① 모델터 — 한국 상업용 부동산(CRE) 재무모델 빌더

숫자만 넣으면 IRR·DSCR 결과를 화면에서 바로 보여주고, **수식이 살아있는 엑셀**을 그 자리에서 생성하는 단일 파일 웹앱. 빌드 과정 없음.

- 딜 4종: 오피스·물류 매입(13시트), 공동주택 분양 사업수지(6시트, 브릿지→본PF·중도금 월별 엔진), 리파이낸싱 비교(4시트)
- 파일: `dart-search/web/modelter/index.html`(앱 전체), `guide.html`(용어사전·SEO), `howto.html`(실무 워크플로), `im-checklist.html`(IM 첫 검토), `trust.html`(데이터 흐름), `verification.html`(화면=Excel 검증), `og.png`, `robots.txt`, `sitemap.xml`, `_headers`. 검색 배포 후 운영은 `docs/SEARCH_OPERATIONS.md`
- 자본구조 4단: 선순위 → **중순위(메자닌)** → 보증금 승계 → 우선주 → 보통주. 중순위는 이자 지급 방식이 핵심 분기 — `이자만 지급`(현금, DSCR 하락)과 `만기일시상환(이자 누적·PIK)`(잔액 증가, 매각 시 일괄)
- 부가: 공유 링크(#v=/#e=, LZW 압축, 임차인명 마스킹), 한 줄 보고 복사, 모바일 위저드(⚡핵심만), 딥링크 `#t=office|logistics|dev|refi(&view=lender)`, IC 원페이저 인쇄, 자동 판정, 억·조 환산 힌트. 공유 링크 압축은 암호화가 아니므로 권한 있는 채널로만 전달
- **도착 시 자동 팝업 없음**(2026-08-11) — What's new 는 공지 배너 버튼으로만. 재방문(`mt_used`)은 소개를 접고 도구부터

### 핵심 원칙 — 파리티

**화면 수치 = 다운로드 엑셀.** 계산 엔진·엑셀 생성기를 고치면 반드시 `tools/parity` 2단계로 재검증:

```bash
node tools/parity/gen-xlsx.js office|logistics|dev|refi   # 생성
python3 tools/parity/check.py office|logistics|dev|refi   # 재계산 비교 (pip install formulas) — 4딜 전수
# 자본구조·경계 변형: office_nopref|office_nonpass(비도관+NOI 직접)|office_hold7|office_nodebt(무차입)|office_vac100(공실 100%)
#                     office_mezz(중순위 현금이자)|office_mezzpik(중순위 이자누적 PIK)
# 전 딜 공통 구조 검사도 함께 돈다 — 비유한값 0 · 엑셀 오류 토큰 0 · 검증 시트 종합 판정 PASS
```

### 작업 절차 (매 변경마다)

1. `codex/…` 작업 브랜치에서 편집한다. **저장소 사본이 진실**이며 master 직접 푸시는 금지다.
2. `node tools/stamp-build.js`
3. `node tools/gen-verification.js` — 4딜 중 하나라도 파리티를 재현하지 못하면 중단
4. `node tools/gen-pages.js` 후 `node tools/gen-pages.js --check`
5. `node tools/modelter-ci-check.js` 후 `node tools/qa/invariants.js`
6. `grep -c "__mtCalc" dart-search/web/modelter/index.html` → **0** 확인
7. `node tools/qa/smoke.js` — 실제 브라우저 49개 경로. Playwright·Chromium 경로가 자동 탐색되지 않으면 `CHROME_BIN`을 명시
8. 계산·엑셀 로직 변경 시 위 절차와 별도로 11개 딜·경계 변형의 파리티 2단계를 전수 실행
9. 한국어 커밋 → 작업 브랜치 push → PR. master 보호 규칙의 `검증`·`파리티 11조합`·`브라우저 스모크 49건`이 모두 통과한 뒤 머지
10. Cloudflare 배포 성공과 라이브 `MT_BUILD`를 확인한다. 계기판 스냅샷도 master 직접 커밋이 아니라 자동 브랜치·PR·동일 게이트를 거친다.
11. 검색 착지·canonical·sitemap을 바꿨다면 `docs/SEARCH_OPERATIONS.md`에 따라 라이브 사이트맵과 Search Console 발견 상태를 확인한다. 사이트맵 정답은 `https://modelter.com/sitemap.xml` 한 개다.

### 불변 규칙 (완화 금지)

- **딜 데이터 서버 전송 금지.** `/e` 수집은 이벤트명·딜유형·기능플래그·기기·유입 호스트만 — 수치·임차인명·PII 절대 금지
- 렌트롤 원본 binary 저장 금지, 임차인 실명 기본 비저장 + 공유 링크 자동 마스킹
- `__mtCalc` 등 테스트 훅 배포 금지
- What's new 라벨은 **v3 고정** (버전 번호 인상 금지 — 내용만 현행화)
- "투자 권유가 아닌 정보 제공 목적" 문구 유지
- 숫자 예시는 샘플, 실제 시세 아님

### 계기판 (사용 데이터)

- `worker.js` `/e` → Cloudflare Analytics Engine(dataset `Modelter`) + Workers Logs
- 조회: `node tools/modelter-ae.js`(누적 SQL, 계정ID·토큰은 사용자 로컬에서만 — 채팅에 토큰 금지), `tools/modelter-funnel.js`(wrangler tail 파싱)
- 퍼널: session → activate(신뢰 입력만) → computed → output(xlsx/share/pdf 등), 세션당 1회

### 참고

- 단일 파일 유지. 크기 임계는 폐지됨(2026-07) — **CI가 강제하는 성능 예산**(gzip<300KB·렌더 블로킹 외부 CSS 0건·dev 재계산<500ms)으로 대체. 초과 시 대응 순서는 `docs/STRATEGY.md` 에스컬레이션 사다리 참조. 새 출력·부가 기능 코드는 반드시 부트 지점(첫 렌더) 뒤 블록에 추가
- 예시 딜: 강남 A타워(오피스)·판교 A지구(분양)·분당 B빌딩(리파이) — `EXAMPLES`
- 민감도: 오피스·물류 Exit Cap×성장률/금리(5×5), 분양 분양률×분양가(4×5, 순수 코어만 사용 — 셀에서 simDevResi 호출 금지, 입력 반응성 회귀 원인)

## ② 리츠인사이트 (루트 index.html)

일반 투자자용 상장리츠 정보 + 종목별 댓글(localStorage 데모). 종목명·코드는 실제, 수치는 예시. 미리보기는 브라우저로 열면 됨.

## ③ 공시렌즈 (dart-search/)

DART 사업보고서 전문 검색. OpenDART 수집(`collect.py`)·AI 요약(`summarize.py`)·SQLite(`db.py`)·검색 앱(`web/index.html`). 설계 `ARCHITECTURE.md`, 단계 `ROADMAP.md`. 모델터와 배포 디렉터리(`dart-search/web/`)를 공유하지만 독립 프로젝트.

## 사용자·소통

- 사용자는 **코딩 입문자**(코람코자산신탁 상장리츠팀), 한국어로 소통, 쉬운 설명과 작은 단계
- 커밋 메시지는 한국어, 변경 의도가 드러나게
- **푸시·머지 권한**: 사용자가 사전 승인함(2026-07-09). 작업 브랜치 push와 검증 완료 PR 머지는 추가 허락 없이 가능하지만, master 보호 규칙을 우회하거나 직접 푸시하지 않는다.
