# DART 사업보고서 검색 (POC)

한국 기업들의 **DART 사업보고서**를 OpenDART 공식 API로 자동 수집하고,
본문을 **검색**할 수 있게 만드는 사이트의 개념증명(POC)입니다.

> ⚠️ **중요 — 광고 수익이 목표라면**
> 사업보고서 *원문만 그대로* 복사해 올리고 구글 광고를 붙이면, 구글 애드센스의
> "스크랩/중복 콘텐츠" 정책에 걸려 **승인 거부·계정 정지 위험**이 큽니다.
> 그래서 이 프로젝트는 처음부터 **부가가치형**(원문 + 검색 + 앞으로 요약·핵심지표)으로
> 설계했습니다. 원문 위에 우리만의 가치를 더하는 게 핵심입니다.

---

## 폴더 구성

```
dart-search/
├─ collect.py            # ① OpenDART 수집 스크립트 (표준 라이브러리만 사용, pip 설치 불필요)
├─ summarize.py          # ② Claude API로 요약·핵심지표 자동 추출 (pip install anthropic 필요)
├─ config.example.json   # 설정 예시 (복사해서 config.json 으로 사용)
├─ web/
│  ├─ index.html         # 검색 화면 (브라우저로 열기)
│  ├─ demo-data.js       # 키 없이 동작을 볼 수 있는 데모 샘플
│  └─ data.js            # collect.py/summarize.py 가 만드는 '진짜' 데이터 (깃에 안 올라감)
└─ data/                 # 수집 원본/캐시 (깃에 안 올라감)
```

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

## 주의사항
- **인증키(`config.json`)는 깃에 올리지 마세요.** `.gitignore` 로 자동 보호됩니다.
- OpenDART 는 **하루 호출 한도**가 있어, "모든 기업"은 한 번에 못 받고 나눠서 수집해야 합니다.
- 데이터 출처는 반드시 **금융감독원 DART** 로 표기하고, 정보 제공 목적임을 명시하세요.

## 다음 단계 후보
- 수집 기업을 전체 상장사로 확장 + DB 저장(SQLite/PostgreSQL)
- 전문 검색 엔진 도입(예: Meilisearch) — 빠른 전체 텍스트 검색
- **부가가치**: AI 자동 요약(예: Claude API), 핵심 재무지표 자동 추출/비교
- 정기 자동 수집(스케줄러: cron / GitHub Actions)
- 사이트 공개 + 애드센스 신청
