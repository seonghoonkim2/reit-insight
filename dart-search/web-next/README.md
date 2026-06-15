# 공시렌즈 Next.js 프런트엔드 (SSR/SEO)

대규모 SEO를 위한 서버 렌더링 프런트엔드입니다. `backend/` 의 FastAPI API를 호출해
회사/보고서/키워드 페이지를 서버에서 렌더링하고, `generateMetadata`·JSON-LD·sitemap·robots 로
검색엔진 최적화를 합니다.

> 가벼운 무설치 버전은 상위 폴더 `web/index.html`(SPA) 입니다. 이 Next 앱은 그 상위 호환이며
> **백엔드 API가 떠 있어야** 데이터가 보입니다.

## 실행
```bash
# 1) 백엔드 먼저 (다른 터미널)
cd ../backend && docker compose up -d --build && docker compose run --rm backend python load.py

# 2) 프런트엔드
cd ../web-next
cp .env.example .env.local        # NEXT_PUBLIC_API_BASE=http://localhost:8000 확인
npm install
npm run dev                       # http://localhost:3000
# 배포 빌드: npm run build && npm start
```

## 페이지
```
/                       홈(인기 검색어 + 회사 목록)
/search?q=&year=&corp_code=   검색 결과(SSR)
/company/[code]         회사 + 연도별 보고서 (generateMetadata + JSON-LD Organization)
/filing/[rcept]         보고서 전문(섹션) (JSON-LD Article, canonical)
/topic/[kw]             키워드가 언급된 보고서 + 회사별 빈도
/sitemap.xml /robots.txt
```

## 구조
```
web-next/
├─ app/
│  ├─ layout.tsx page.tsx globals.css not-found.tsx
│  ├─ search/page.tsx
│  ├─ company/[code]/page.tsx
│  ├─ filing/[rcept]/page.tsx
│  ├─ topic/[kw]/page.tsx
│  ├─ sitemap.ts robots.ts
├─ components/  SearchBar.tsx(클라이언트) Disclaimer.tsx
└─ lib/  api.ts(백엔드 호출) types.ts
```

## 메모
- `NEXT_PUBLIC_API_BASE` 가 서버에서 접근 가능해야 합니다(도커 네트워크/호스트 주소 확인).
- `/search` 는 `robots.ts` 에서 색인 제외(noindex), 회사/보고서/키워드 페이지만 색인.
- AdSense 는 각 페이지의 `.ad` 자리에 실제 광고 단위를 넣어 활성화하세요.
