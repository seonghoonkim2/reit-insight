# 공시렌즈 배포 & 실데이터 수집 가이드

이 환경(샌드박스)은 인터넷이 막혀 실수집/배포를 직접 실행하지 못합니다.
그래서 **GitHub Actions 와 Docker** 로 "클릭 한 번 / 한 줄 명령"이면 실제로 돌도록 만들어 두었습니다.

> 🔐 **보안**: 채팅에 한 번 노출된 OpenDART 키는 **재발급**을 권장합니다.
> 키는 코드/깃에 절대 넣지 말고, 아래처럼 **GitHub Secrets** 또는 로컬 `config.json`(깃 제외)에만 두세요.

---

## A. 실데이터 1회 수집 (가장 쉬움 — 로컬 PC 불필요)
GitHub 러너가 OpenDART에서 실제로 수집해 **GitHub Pages에 실데이터 사이트**를 띄웁니다.

1. 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - `DART_API_KEY` = OpenDART 인증키 (필수)
   - `ANTHROPIC_API_KEY` = Claude 키 (선택, 있으면 AI 요약까지)
2. **Settings → Pages → Source = "GitHub Actions"**
3. **Actions 탭 → "Collect DART data" → Run workflow** (종목코드 입력 가능)
4. 끝나면 Pages URL에 **실제 사업보고서 검색 사이트**가 뜨고, 실행 결과에 `gongsilens-data`
   아티팩트(`reports.json`)가 첨부됩니다.

> 로컬에서 하려면: `cd dart-search && cp config.example.json config.json`(키 입력) →
> `python3 collect.py` → `python3 summarize.py`(선택) → `web/index.html` 새로고침.

---

## B. 프로덕션 배포 (PostgreSQL + OpenSearch + Next.js)

### B-1. 이미지 자동 발행 (CD)
`master`에 backend/web-next 변경이 푸시되면 **GitHub Actions(`cd.yml`)** 가 Docker 이미지를
**GHCR(GitHub Container Registry)** 에 자동 발행합니다(외부 시크릿 불필요).
- `ghcr.io/<owner>/gongsilens-backend:latest`
- `ghcr.io/<owner>/gongsilens-web:latest`
> 처음엔 Actions 탭에서 "CD (publish images)" 를 한 번 수동 실행하세요.
> 패키지가 private면 Settings → Packages 에서 공개로 바꾸거나 pull 시 로그인하세요.

### B-2. 어디서나 실행 (발행 이미지 pull)
```bash
cd dart-search/deploy
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml run --rm backend python load.py   # 데이터 적재
# 프런트 http://localhost:3000 · API http://localhost:8000
```
- 실데이터를 넣으려면 위 A에서 받은 `reports.json` 을 `dart-search/data/reports.json` 에 두고 `load.py` 실행.

### B-3. 직접 빌드해서 띄우기 (이미지 발행 없이)
```bash
cd dart-search/backend && docker compose up -d --build && docker compose run --rm backend python load.py
cd ../web-next && npm install && API_BASE=http://localhost:8000 npm run dev   # 또는 docker build
```

### 클라우드 호스팅(선택)
- **web-next**: Vercel 에 import 하면 자동 빌드/배포(서버리스). `NEXT_PUBLIC_API_BASE`(또는 `API_BASE`)에 백엔드 주소 설정.
- **backend**: Railway/Fly.io/VPS 등에 GHCR 이미지로 배포. Postgres·OpenSearch 는 매니지드 서비스 권장.

---

## 워크플로 요약
| 워크플로 | 트리거 | 하는 일 |
|---|---|---|
| `ci.yml` | push/PR | 셀프테스트·검색·SEO·설정 검증 (+ Next/Docker 빌드 참고) |
| `collect-data.yml` | 수동 | OpenDART 실수집 → (선택)요약 → Pages 배포 + 데이터 아티팩트 |
| `cd.yml` | master push/수동 | backend·web 이미지를 GHCR 에 발행 |
| `gongsilens-pages.yml` | 수동 | 데모 SPA(`web/`)를 Pages 에 배포 |
