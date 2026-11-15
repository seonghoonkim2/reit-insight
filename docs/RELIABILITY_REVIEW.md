# 입력·엑셀·모바일 개선 검수 (2026-11-15)

## 범위와 원본 보존

원 체크아웃의 추적 파일은 수정하지 않았다. 최신 원격 기준 `e38930165d0ee84f7bff6af85057025664f23c5e`에서 별도 작업 브랜치를 만들고, Library의 `Modelter-개선코드-검수-20261112.zip` 패치를 원래 기준 커밋과 대조해 복구했다. 앞선 미배포 개선(Worker 생성 단계·취소·재시도, 첫 입력 안내, 로컬 저장 복구)을 보존하고 실제 Chrome으로 검수했다. 앞선 환경의 브라우저 실행 제한은 이번 로컬 검수에서 해소됐다.

## 사용자 동작 변경

- Excel 생성 전 중단: 예시값 확인 취소, 저장 버전 선택 취소, 필수값 누락, 숫자 형식·범위 오류를 구분한다. 실제 생성에 들어가기 전에는 생성 실패 이벤트를 보내지 않는다. 입력 확인 버튼으로 해당 필드에 복귀한다.
- 생성 중: 입력 스냅샷을 바탕으로 Worker의 실제 계산·직렬화·다운로드 준비 단계를 표시한다. 반복 클릭은 한 작업으로 유지한다. 취소·Esc·60초 제한·실행 오류 후 입력을 보존하며 현재 입력으로 재시도한다. Worker와 Blob URL을 정리한다.
- 다운로드: 브라우저에 다운로드를 요청했다는 사실과 다운로드 목록 확인 방법을 표시한다. 디스크 저장 완료라고 말하지 않는다. Worker 미지원 시 기존 동기 처리로 진행하며 취소·시간 제한이 적용되지 않음을 안내한다.
- 첫 입력: 딜별 첫 숫자로 이동하는 기존 안내를 보존했다. 저장 상태·백업 동작을 입력 영역 아래에 배치해 첫 입력 전에 안내가 과하게 쌓이지 않게 했다.
- 모바일: 작은 화면과 키보드로 높이가 줄어든 화면에서 입력 위저드가 스크롤되도록 했다. 기존 주요 행동 버튼의 터치 높이를 확보했다. 스크롤 뒤 도움말이 결과 위에 남는 현상과 떠 있는 입력 이동 버튼이 PPT·저장 버튼을 덮는 현상을 수정했다.
- 로컬 저장: 앞선 개선의 할당량·손상·백업·다중 탭 보호를 유지했다. 기존 retention 검사는 유효한 백업이 없는 손상 상태를 명시해 새 복구 기능과 구분한다.

## 데이터·계산 경계

서버 저장·인증·새 추적 필드를 추가하지 않았다. 입력값·임차인 실명·원본 렌트롤을 계측으로 보내지 않는다. 익명 이벤트 스키마와 동의 고지를 유지했다. 계산 엔진의 주요 구간은 기준 커밋과 주석·공백을 제외한 소스가 동일하며, 11조합 화면/Excel 파리티를 전부 통과했다. 앞선 패치의 독립 주석 정리는 gzip 예산을 위한 것으로 계산식 변경이 아니다.

## 검증 명령과 결과

환경: Windows, Node, 로컬 Google Chrome + Playwright. 모바일은 Chrome의 360/390/430px 터치 에뮬레이션이며 데스크톱은 1280px이다. 물리적 iOS/Android 기기 검수가 아니다. 테스트는 합성 딜 입력을 사용한다.

필수 순서: `node tools/stamp-build.js` → `node tools/gen-verification.js` → `node tools/gen-pages.js` → `node tools/gen-pages.js --check` → `node tools/modelter-ci-check.js` → `node tools/qa/invariants.js` → `__mtCalc` 0개 확인 → `node tools/qa/smoke.js`.

- 검증 페이지: office/logistics/dev/refi 4딜 PASS. 검색 착지면 38개 최신 확인.
- 엔진 불변식: 17개 PASS. 테스트 훅 0개. gzip 294KB로 300KB 미만.
- 파리티: 각 딜에 `node tools/parity/gen-xlsx.js <deal>` 및 `python tools/parity/check.py <deal>` 실행. office, logistics, dev, refi, office_nopref, office_nonpass, office_hold7, office_nodebt, office_vac100, office_mezz, office_mezzpik 모두 PARITY OK. 숫자 유한성·Excel 오류·검증 시트 검사 포함.
- `node tools/qa/ux-mobile.js`: 16개 딜/화면 조합, 339개 검사. 입력·결과·공유·저장·PPT·실제 XLSX 다운로드·화면 가림·가로 넘침·터치·축소 높이 검증. `MODELTER_QA_EVIDENCE`에 화면과 results.json 생성.
- `node tools/qa/excel-progress.js`: 24개. 실제 4딜 Worker, 반복 클릭, 취소/Esc, 시간 제한, 시작/직렬화/응답 오류, 빈 결과, 동기 대체, 변경 입력 재시도, 예시/버전 확인 취소, 4딜 필수값 누락, 잘못된 숫자·범위.
- `node tools/qa/first-input.js`: 198개와 실제 4딜 XLSX 다운로드 PASS.
- `node tools/qa/storage-reliability.js`: 34개 PASS. `node tools/qa/excel-progress-unit.js`: 14개 PASS. `node tools/qa/storage-onboarding-browser.js`: 23개 PASS.
- 추가 독립 검사: financial-engine 314개, refi-model 4,153개, dev-model 27개, input-contract 596개, xlsx-cache 33개, template-compaction 13시트/1,620셀, search-handoff 59개, growth-metrics 83개, worker-privacy.mjs 121개 PASS.

- 기존 브라우저 회귀: retention 70개, workspace-versions 35개, result-save 56개, editable-browser 39개/3딜 실제 다운로드, offline 8개, search-handoff --browser 99개 PASS.
- `node tools/qa/perf-load.js`: 다른 Chrome 검사 종료 후 단독 실행 PASS. 첫 결과 데스크톱 545ms, 중급 모바일 근사 2,467ms, 저가 모바일 근사 4,193ms (5,000ms 미만). 병렬 검사 중 5,980ms가 나온 실행은 성능 결과에서 제외하지 않고 환경 경합 사례로 남긴다.

최종 필수 스모크는 89개 통과·0개 실패다. 초기 로컬 검수 빌드는 `2026-11-15·85077d9394`이며 필수 순서와 `git diff --check`를 모두 통과했다. 각 실행 로그는 배포 검토 패키지의 TEST_RESULTS에 기록한다. 이전 검수에서 실행하지 못한 브라우저 검사는 이번에 실제 실행했다.

## 배포 상태와 남은 확인

초기 로컬 검수 시점에는 미배포 상태였다. 이후 공개 업로드와 필수 CI 후 병합·배포 승인을 확인해 PR #161을 생성했다. 해당 PR의 최신 커밋에 대한 Modelter CI 전체 통과 후 병합하며, 운영 사이트의 빌드 스탬프와 다운로드 동작을 별도로 확인한다. 실제 iOS Safari/Android 키보드·파일 목록 동작은 기기별 후속 확인 대상이다.


## 원격 CI 보완

PR #161의 첫 원격 실행에서 기본 검증·Excel 상태 24개는 통과했지만, Linux Chrome의 글꼴 조합에서 PPT 다운로드 버튼 높이가 44px 미만으로 나왔다. Windows의 글자 높이에 기대던 `.xl-dl`에도 모바일 최소 높이 44px를 명시했다. 재무·Excel 계산과 동작 로직은 바꾸지 않았다. 수정 빌드는 `2026-11-16·7297e985f0`이며 동일 PR의 새 커밋 전체 필수 CI가 통과하기 전에는 병합하지 않는다.
