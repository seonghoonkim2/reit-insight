# 모델터 검색 색인 운영

검색 착지면을 만든 것과 검색엔진이 그 URL을 발견·색인한 것은 서로 다른 상태다. 이 문서는 `modelter.com` 본체의 발견 경로를 배포 뒤 확인하는 최소 절차다. 검색 순위나 채택을 색인 완료와 혼동하지 않는다.

## 정답 경로

- 서비스: `https://modelter.com/`
- 사이트맵: `https://modelter.com/sitemap.xml`
- 크롤 안내: `https://modelter.com/robots.txt`
- Search Console 속성: 도메인 속성 `modelter.com`

`robots.txt`에는 정확히 `Sitemap: https://modelter.com/sitemap.xml`이 있어야 한다. Search Console의 사이트맵 입력란에는 루트 URL, 여러 페이지를 이어 붙인 문자열, HTML 페이지를 넣지 않는다. 등록 대상은 위 사이트맵 한 개다.

## 검색에 영향을 주는 배포 뒤

1. 라이브 `sitemap.xml`이 HTTP 200·`application/xml`인지 확인한다.
2. `<loc>` 개수가 생성기·CI의 예상 개수와 같고, 새 URL이 무확장 canonical로 들어갔는지 확인한다.
3. Search Console → **Sitemaps**에서 정확한 사이트맵 행의 상태가 `성공`인지 확인한다.
4. Search Console 도메인 속성에는 `korea.modelter.com`도 함께 잡히므로, 모델터 본체 실적은 페이지 필터 **다음이 포함된 URL = `https://modelter.com/`** 로 분리한다.
5. 새 고의도 착지면 한두 개만 URL 검사한다. `실제 URL 테스트`가 색인 가능·canonical 정상인지 먼저 본다.

사이트맵 제출과 `색인 생성 요청`은 Google 쪽 상태를 바꾸는 외부 작업이다. 브라우저 자동화로 실행할 때는 작업 직전에 운영자 확인을 받는다. 여러 URL을 알릴 때는 개별 요청을 반복하지 않고 사이트맵을 사용한다. 제출은 발견 힌트일 뿐 색인·노출·순위를 보장하지 않으므로, 최소 7일 전에는 누락으로 단정하지 않는다.

Google 공식 참고: [사이트맵 생성·제출](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [URL 검사](https://support.google.com/webmasters/answer/9012289)

## 네이버

네이버도 같은 `sitemap.xml`을 사용한다. `robots.txt`의 Sitemap 행으로 자동 발견할 수 있지만, 웹마스터도구에 로그인할 수 있을 때는 사이트 소유 확인 후 **요청 → 사이트맵 제출**에서 같은 경로를 등록하고 상태를 확인한다. 계정 로그인·사이트 등록·제출은 운영자 확인 없이 대신 진행하지 않는다.

네이버 공식 참고: [RSS 및 사이트맵 제출](https://searchadvisor.naver.com/guide/request-feed)

## 판독 규칙

- 색인 URL 수 증가는 **발견 경로가 열린 것**이지 제품 채택 증거가 아니다.
- 검색 클릭은 Search Console, 계산기 진입 이후는 익명 `src` 퍼널로 나눠 본다.
- 쿼리·페이지 실험은 사전에 정한 최소 기간과 노출 표본을 채운 뒤 판정한다.
- 팀 안에서 반복 사용되는지는 `docs/NORTH_STAR_EVIDENCE.md`의 정량·질적 기준으로만 판단한다.
- 계정명·이메일·Search Console 내보내기 토큰은 문서·이슈·커밋·채팅에 남기지 않는다.
