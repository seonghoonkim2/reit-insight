# 리츠인사이트 (reit-insight)

일반 투자자가 한국 **상장리츠(REITs)** 를 쉽고 자세하게 이해하도록 돕는 정보 플랫폼.
리츠별 **댓글**로 투자자끼리 소통하는 것이 핵심 목표.

## 현재 구조
- `index.html` — 전부 한 파일에 들어있는 정적 사이트 (HTML + CSS + JS, 빌드 과정 없음)
  - 상장리츠 기초 설명 / 리츠 목록 + 섹터 필터 + 검색 / 상세 모달 / 댓글
  - 리츠 데이터는 `index.html` 안의 `REITS` 배열에 하드코딩됨
  - 댓글은 브라우저 `localStorage`에 저장 (데모용 — 사용자 간 공유 안 됨)
- `dart-search/` — **별도 하위 프로젝트 "공시렌즈(GongsiLens)"**: DART 사업보고서 전문 검색 사이트.
  OpenDART 수집(`collect.py`)·AI 요약(`summarize.py`)·SQLite(`db.py`)·검색 앱(`web/index.html`).
  설계: `dart-search/ARCHITECTURE.md`, 단계: `dart-search/ROADMAP.md`. (리츠 사이트와 독립)

## 주의사항
- 배당수익률·주가 등 **숫자는 예시 샘플**, 종목명·종목코드는 실제 값
- 투자 권유가 아닌 정보 제공 목적

## 작업 시 참고
- 사용자는 **코딩 입문자**이며 한국어로 소통. 쉬운 설명과 작은 단계로 진행할 것
- 미리보기: `index.html`을 브라우저로 열면 됨 (서버 불필요)

## 다음 단계 후보
- 실제 공유 댓글 (백엔드/DB, 예: Supabase)
- 실제 리츠 데이터 연동
- GitHub Pages로 사이트 공개
