# 공시렌즈 백엔드 (PostgreSQL + OpenSearch + FastAPI)

확장 단계의 백엔드입니다. 한국어 형태소(nori) 기반 OpenSearch 를 주 검색엔진으로,
PostgreSQL 을 메타/폴백 검색으로 씁니다. **Docker 만 있으면 한 번에 띄울 수 있습니다.**

> 무설치 버전이 필요하면 상위 폴더의 `api.py`(표준 라이브러리 + SQLite)를 쓰세요.
> 이 백엔드는 `api.py` 와 **동일한 엔드포인트 모양**이라 프런트(웹/Next.js)를 그대로 붙일 수 있습니다.

## 실행
```bash
cd dart-search/backend
docker compose up -d --build          # postgres + opensearch(nori) + backend
docker compose run --rm backend python load.py   # 데모(또는 ../data/reports.json) 적재
# API → http://localhost:8000
curl "http://localhost:8000/api/v1/search?q=우발부채"
```
- 실데이터를 넣으려면: 상위 폴더에서 `python3 collect.py` 로 `data/reports.json` 을 만든 뒤
  `docker compose run --rm backend python load.py` (자동으로 `/data/reports.json` 사용).

## 구성
```
backend/
├─ docker-compose.yml      # postgres + opensearch + backend
├─ schema.sql              # PostgreSQL 스키마(최초 기동 시 자동 적용)
├─ opensearch.Dockerfile   # OpenSearch + analysis-nori
├─ opensearch/index.json   # 한국어(nori) 인덱스 매핑
├─ Dockerfile              # FastAPI 이미지
├─ requirements.txt
├─ load.py                 # Postgres+OpenSearch 적재
└─ app/
   ├─ main.py              # FastAPI (search/companies/company/filings/healthz)
   ├─ search.py            # OpenSearch(nori) + Postgres 폴백
   ├─ db.py                # psycopg 풀
   └─ settings.py
```

## 엔드포인트 (api/openapi.yaml 와 동일)
- `GET /healthz`
- `GET /api/v1/search?q=&year=&corp_code=&limit=`
- `GET /api/v1/companies`
- `GET /api/v1/company/{corp_code}`
- `GET /api/v1/filings/{rcept_no}`

## 메모
- OpenSearch 가 안 떠 있으면 `search.py` 가 자동으로 PostgreSQL(trgm/tsvector) 폴백을 씁니다.
- 운영 시 `DISABLE_SECURITY_PLUGIN=true` 를 끄고 인증/TLS를 설정하세요(데모 단순화용).
