# 모델터 검색 색인 운영

검색 착지면을 만든 것과 검색엔진이 그 URL을 발견·색인한 것은 서로 다른 상태다. 이 문서는 `modelter.com` 본체의 발견 경로를 배포 뒤 확인하는 최소 절차다. 검색 순위나 채택을 색인 완료와 혼동하지 않는다.

## 정답 경로

- 서비스: `https://modelter.com/`
- 사이트맵: `https://modelter.com/sitemap.xml`
- 크롤 안내: `https://modelter.com/robots.txt`
- Search Console 속성: 도메인 속성 `modelter.com`

`robots.txt`에는 정확히 `Sitemap: https://modelter.com/sitemap.xml`이 있어야 한다. Search Console의 사이트맵 입력란에는 루트 URL, 여러 페이지를 이어 붙인 문자열, HTML 페이지를 넣지 않는다. 등록 대상은 위 사이트맵 한 개다.

## 2026-08-16 읽기 전용 확인 상태

- 정식 `https://modelter.com/sitemap.xml`은 아직 제출 목록에 없다.
- 모델터 본체에 관해 제출된 항목은 `http://modelter.com/`, `https://modelter.com/`, 여러 URL을 한 문자열로 붙인 항목 3개이며 모두 오류 또는 가져올 수 없음 상태다. 루트 URL은 사이트맵이 아니므로 다시 제출하지 않는다.
- 색인 보고서의 마지막 갱신일은 2026-08-07이다. 그 시점에 본체에서 확인된 색인 URL은 홈·`/trust`·`/verification`·`/t/dscr` 4개다. 이후 배포한 `/im-checklist`와 생성 착지면을 이 오래된 보고서만으로 누락 판정하지 않는다.
- 라이브 `sitemap.xml`은 HTTP 200이고 현재 canonical 44개를 담고 있다. 다음 외부 작업은 운영자 승인 뒤 이 파일 하나를 제출하는 것이다. 성공 확인 전 기존 오류 행을 지우지 않으며, 삭제 여부도 별도 확인한다.

위 확인에서는 제출·삭제·색인 요청·내보내기를 하지 않았다. Search Console 계정 정보와 원시 성과표는 저장소에 기록하지 않는다.

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

## DSCR 검색 스니펫 판독 — 2026-08-15 변경분

도메인 속성 전체에는 `korea.modelter.com`의 여행 검색이 섞인다. 본체 홈도 브랜드 검색 비중이 높으므로, 도메인 합계나 홈 CTR을 CRE 비브랜드 발견 성과로 해석하지 않는다. 2026-08-16 읽기 전용 점검에서 `/t/dscr`은 첫 페이지권 평균 위치에서 노출되지만 클릭이 없는 기회면으로 확인됐다. 정확한 횟수·검색어 원표는 공개 저장소가 아닌 `data/search-console/` 로컬 경로에만 둔다.

8월 15일 배포한 제목·설명·판독표가 이 기준선 뒤의 개입이다. 같은 면을 계속 고쳐 원인을 흐리지 않도록 **2026-08-15~2026-08-29**를 고정 후속 창으로 두고, 8월 29일 이후 아래 순서로 한 번 판독한다.

1. Search Console에서 `페이지 = 정확히 https://modelter.com/t/dscr`, 검색 유형 웹, 사용자설정 기간 2026-08-15~2026-08-29를 적용한다.
2. 노출 100회 미만이면 CTR을 판정하지 않고 더 기다린다.
3. 노출 100회 이상이고 평균 위치 10위 이내에서 CTR 2% 이상·클릭 2건 이상이면 현재 스니펫을 유지한다.
4. 같은 조건에서 CTR 1% 미만이면 실제 상위 검색어에 맞춰 제목·설명만 한 번 수정한다. 평균 위치가 10위 밖이면 스니펫 문제가 아니라 내용·내부 링크·색인 문제로 분리하고 제목을 반복 변경하지 않는다.
5. 검색 클릭 이후는 `src=dscr`로 본다. 세션 10건 전에는 전환을 판정하지 않고, 이후 자기 숫자 입력률 15% 이상·실사용 산출물 1건 이상일 때만 같은 문제군의 콘텐츠 확대를 검토한다.

Search Console CSV·Google Sheets 내보내기는 계정·운영 데이터다. 필요할 때 `data/search-console/`에만 저장하며 Git에 강제 추가하지 않는다. 공개 문서에는 판정과 일반화된 결론만 옮긴다.
