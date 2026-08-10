/* 모델터 CI 검증 — 라이브 배포 전 깨진 코드/빠진 파일 차단
 * 실행: node tools/modelter-ci-check.js   (의존성 없음)
 * 검사: ① 앱 로드(전 script 문법) ② 4개 딜 계산 무예외 ③ 렌트롤 경로(struct/tranche/mini)
 *       ④ 핵심 모듈/수정 존재 ⑤ _headers(CSP·X-Frame-Options) ⑥ og.png 존재
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'dart-search', 'web', 'modelter');
const HTML = path.join(DIR, 'index.html');
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); else console.log('  ✓ ' + msg); };

const html = fs.readFileSync(HTML, 'utf8');

/* ── 0) 성능 예산 — 사용자 체감 기준 (docs/STRATEGY.md 아키텍처 정책) ── */
{
  const htmlNoNs = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
  const extCss = (htmlNoNs.match(/<link[^>]+rel="stylesheet"[^>]*>/g) || []).filter(t => /href="https?:\/\//.test(t));
  ok(extCss.every(t => t.includes('media="print"')), '성능 예산: 렌더 블로킹 외부 CSS 0건 (' + extCss.length + '건 전부 비동기)');
}
const gzKB = Math.round(require('zlib').gzipSync(Buffer.from(html), { level: 6 }).length / 1024);
ok(gzKB < 300, '성능 예산: gzip 전송량 ' + gzKB + 'KB < 300KB (초과 시 출력 생성기 지연 로딩부터 검토)');

/* ── 1) 정적 존재 검사 ── */
ok(fs.existsSync(path.join(DIR, 'og.png')), 'og.png 존재 (소셜 미리보기 404 방지)');
ok(fs.existsSync(path.join(DIR, 'robots.txt')), 'robots.txt 존재 (크롤 안내)');
ok(fs.existsSync(path.join(DIR, 'sitemap.xml')), 'sitemap.xml 존재');
ok(fs.existsSync(path.join(DIR, 'guide.html')), '가이드·용어사전 페이지 존재 (SEO)');
ok(fs.existsSync(path.join(DIR, 'howto.html')), '실무 활용 가이드(howto) 존재 (SEO)');
if (fs.existsSync(path.join(DIR, 'howto.html'))) {
  const hw = fs.readFileSync(path.join(DIR, 'howto.html'), 'utf8');
  ok(hw.includes('"@type":"HowTo"') && hw.includes('BreadcrumbList'), 'howto.html 구조화 데이터(HowTo·Breadcrumb)');
  ok(hw.includes('/#t=office') && hw.includes('/#t=dev&view=lender'), 'howto.html → 계산기 딥링크');
  ok(hw.includes('/guide.html'), 'howto ↔ 용어사전 상호 링크');
  ok(hw.includes('투자 권유가 아닌'), 'howto 고지 문구');
}
if (fs.existsSync(path.join(DIR, 'guide.html'))) {
  const g = fs.readFileSync(path.join(DIR, 'guide.html'), 'utf8');
  ok(g.includes('FAQPage') && g.includes('BreadcrumbList'), 'guide.html 구조화 데이터(FAQ·Breadcrumb)');
  ok(g.includes('DSCR') && g.includes('Cap rate') && g.includes('브릿지'), 'guide.html 핵심 용어 포함');
  ok((g.match(/class="term"/g) || []).length >= 20, 'guide.html 용어 20개 이상');
  ok(g.includes('id="noc"') && g.includes('id="rentfree"') && g.includes('id="masterlease"') && g.includes('id="repay"'), 'guide.html 임대차 실무 용어(NOC·렌트프리 등)');
  ok(g.includes('/#t=dev') && g.includes('/#t=refi') && g.includes('class="try"'), 'guide.html 섹션→계산기 딥링크');
  ok(g.includes('id="irr"') && g.includes('id="dscr"') && g.includes('id="bep"') && g.includes('.term:target'), 'guide.html 용어 앵커 + 하이라이트');
}
if (fs.existsSync(path.join(DIR, 'sitemap.xml'))) {
  const sm = fs.readFileSync(path.join(DIR, 'sitemap.xml'), 'utf8');
  ok(sm.includes('modelter.com/') && sm.includes('/guide<') && sm.includes('/howto<') && sm.includes('/trust<'), 'sitemap: 홈·가이드·활용 가이드·신뢰센터 URL(무확장)');
}

/* ── 1b) 신뢰 센터(trust.html) ↔ worker.js /e 수집 필드 1:1 강제 ──
 *  화면에 "이것만 수집한다"고 써 붙인 표와 코드가 실제로 보내는 필드가 어긋나면 배포 차단.
 *  (신뢰 문서가 코드보다 뒤처지거나 앞서가는 것을 CI가 막음) */
ok(fs.existsSync(path.join(DIR, 'trust.html')), '신뢰 센터(trust.html) 존재 (정보보호 검토 문서)');
if (fs.existsSync(path.join(DIR, 'trust.html'))) {
  const trust = fs.readFileSync(path.join(DIR, 'trust.html'), 'utf8');
  const workerPath = path.join(__dirname, '..', 'worker.js');
  const workerSrc = fs.existsSync(workerPath) ? fs.readFileSync(workerPath, 'utf8') : '';
  ok(!!workerSrc, 'worker.js 존재 (/e 수집 필드 원본)');
  // worker.js가 /e로 실제 보내는 필드 집합 = rec 객체 리터럴의 키
  const recM = workerSrc.match(/const\s+rec\s*=\s*\{([\s\S]*?)\};/);
  ok(!!recM, 'worker.js에서 rec 객체 리터럴 파싱');
  let recKeys = [];
  if (recM) {
    // 괄호 깊이를 추적해 최상위 콤마로만 분리(값 안의 콤마 s(d.deal,16) 오분리 방지)
    let dep = 0, buf = ''; const parts = [];
    for (const ch of recM[1]) {
      if (ch === '(' || ch === '[') dep++;
      else if (ch === ')' || ch === ']') dep--;
      if (ch === ',' && dep === 0) { parts.push(buf); buf = ''; }
      else buf += ch;
    }
    if (buf.trim()) parts.push(buf);
    recKeys = parts.map(p => (p.split(':')[0] || '').trim()).filter(Boolean);
  }
  const shown = [...trust.matchAll(/data-field="([^"]+)"/g)].map(m => m[1]);
  const shownSet = new Set(shown), recSet = new Set(recKeys);
  const missing = recKeys.filter(k => !shownSet.has(k));   // 코드는 보내는데 문서에 없음
  const extra = shown.filter(k => !recSet.has(k));         // 문서엔 있는데 코드가 안 보냄(유령)
  ok(recKeys.length > 0, 'worker.js 수집 필드 추출 (' + recKeys.join(',') + ')');
  ok(missing.length === 0, 'trust.html: worker.js가 보내는 필드 전부 표기 (누락: ' + (missing.join(',') || '없음') + ')');
  ok(extra.length === 0, 'trust.html: 표기 외 유령 필드 없음 (초과: ' + (extra.join(',') || '없음') + ')');
  ok(shown.length === shownSet.size, 'trust.html: 필드 중복 표기 없음');
  // 내용·인쇄 마커 — "믿지 말고 직접 확인" 절차와 정보보호 검토용 인쇄 스타일
  ok(trust.includes('F12') && trust.includes('네트워크'), 'trust.html: 직접 확인(F12·네트워크 탭) 절차');
  ok(/@media\s*print/.test(trust), 'trust.html: 인쇄(검토 제출)용 스타일');
  ok(trust.includes('api.anthropic.com') && trust.includes('서버'), 'trust.html: BYOK 데이터 흐름(서버 무경유) 명시');
  ok(trust.includes('투자 권유가 아닌'), 'trust.html: 고지 문구');
  // 앱 본체에서 신뢰 센터로 가는 링크(푸터·온보딩·BYOK)
  ok((html.match(/href="\/trust"/g) || []).length >= 3, '앱→신뢰센터 링크 3곳(푸터·온보딩·BYOK) 존재');
}

/* ── 1c) 채널 어트리뷰션(E5) — src 태그·수요 가짜 문 ── */
ok(html.includes("sessionStorage.setItem('mt_src'") && html.includes("/[?#&]src="), '채널 어트리뷰션: 착지 src= 태그 파싱·세션 유지');
ok(html.includes("if(_s) b.src=_s;"), '채널 어트리뷰션: 이벤트에 src 채널 부착(퍼널 분해용)');
ok(html.includes("track('landing')"), '채널 어트리뷰션: landing 이벤트(src 유입 1건)');
ok(html.includes("sessionStorage.getItem('mt_ref0')") && html.includes('document.referrer'), '진짜 유입원: 진입 referrer 호스트 캡처(mt_ref0 — 경로·쿼리 없음)');
ok(html.includes('if(_d0) b.dr=_d0;'), '진짜 유입원: 이벤트에 dr(외부 호스트만) 부착');
{
  const workerSrc2 = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
  ok(/const dr = s\(d\.dr, 40\)\.replace\(\/\[\^A-Za-z0-9.\\-\]\/g, ""\);/.test(workerSrc2) && workerSrc2.includes('if (dr) refHost = dr;'), 'worker.js: dr(진짜 유입원) 정화 후 ref로 기록');
}

/* ── 1k) 판독 분모 위생(P2) — 봇 태깅 + 운영자 QA 제외 ──
 *  판독 게이트(활성화율 등)의 분모에 크롤러·자동화 브라우저·운영자 자신이 섞이면
 *  전략 판단이 왜곡됨. 서버는 태깅만(bot), 제외는 조회 시(blob10!='1') — 원본 보존. */
{
  const workerSrc3 = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
  ok(workerSrc3.includes('const BOT_RE =') && /\(bot\|spider\|crawler\|crawling\|scraper\)\\b/.test(workerSrc3), '분모 위생: worker BOT_RE(접미 경계 일반어) 존재');
  ok(workerSrc3.includes('yeti') && workerSrc3.includes('daumoa') && workerSrc3.includes('kakaotalk-scrap'), '분모 위생: 국내 크롤러(Yeti·Daumoa·카카오 스크랩) 명시');
  ok(workerSrc3.includes('!/cubot/i.test(ua)'), '분모 위생: 실기기 오탐(CUBOT 폰) 명시 제외');
  ok(workerSrc3.includes('d.wd === 1 || d.wd === true'), '분모 위생: 클라이언트 webdriver 신호(wd)도 봇으로 태깅');
  ok(/bot \? "1" : "0"/.test(workerSrc3) && workerSrc3.includes('blob10=bot'), '분모 위생: AE blob10=bot 기록');
  ok(html.includes('if(navigator.webdriver) b.wd=1;'), '분모 위생: 클라이언트 navigator.webdriver → wd=1 부착');
  ok(html.includes("localStorage.getItem('mt_qa')==='1'") && /if\(localStorage\.getItem\('mt_qa'\)==='1'\) return;/.test(html), '분모 위생: 운영자 QA 모드(mt_qa) — track() 조기 반환');
  ok(html.includes('[?#&]qa=(on|off)'), '분모 위생: #qa=on|off 토글 스위치(토스트 안내) 존재');
  const aeSrc = fs.readFileSync(path.join(__dirname, 'modelter-ae.js'), 'utf8');
  ok(aeSrc.includes("blob10 != '1'") && aeSrc.includes('--include-bots'), '분모 위생: modelter-ae.js 기본 봇 제외(+--include-bots 우회)');
  const patSrc = fs.readFileSync(path.join(__dirname, 'modelter-patterns.js'), 'utf8');
  ok(patSrc.includes("blob10 != '1'") && patSrc.includes('--include-bots'), '분모 위생: modelter-patterns.js 기본 봇 제외(+--include-bots 우회)');
}

/* ── 1l) 계측 사전(docs/METRICS.md) ↔ 코드 발화 이벤트 정확 일치 ──
 *  이벤트명이 문서에 없으면(또는 문서에만 있으면) 판독 시 분모·의미를 잘못 읽는다.
 *  코드(track/mtTrack 리터럴) = 진실, 문서는 정확 일치해야 배포 통과. */
{
  const metricsPath = path.join(__dirname, '..', 'docs', 'METRICS.md');
  ok(fs.existsSync(metricsPath), '계측 사전: docs/METRICS.md 존재');
  const md = fs.existsSync(metricsPath) ? fs.readFileSync(metricsPath, 'utf8') : '';
  // \\* — HTML 속성 문자열 안의 이스케이프 발화(onclick="...mtTrack(\'term_help\')...")도 추출
  const codeEvents = [...new Set([...html.matchAll(/(?:mtTrack|track)\(\\*'([a-z_0-9]+)\\*'/g)].map(m => m[1]))].sort();
  ok(codeEvents.length >= 50, '계측 사전: 코드 이벤트 추출 50+ (' + codeEvents.length + '건 — 추출 정규식 파손 감지 하한)');
  const secM = md.match(/<!-- EVENTS:BEGIN -->([\s\S]*?)<!-- EVENTS:END -->/);
  ok(!!secM, '계측 사전: 이벤트 표 마커(EVENTS:BEGIN/END) 존재');
  const docEvents = secM ? [...new Set([...secM[1].matchAll(/^\|\s*`([a-z_0-9]+)`/gm)].map(m => m[1]))].sort() : [];
  const missingDoc = codeEvents.filter(e => !docEvents.includes(e));
  const ghostDoc = docEvents.filter(e => !codeEvents.includes(e));
  ok(missingDoc.length === 0, '계측 사전: 코드 발화 이벤트 전부 문서화 (누락: ' + (missingDoc.join(',') || '없음') + ')');
  ok(ghostDoc.length === 0, '계측 사전: 문서에만 있는 유령 이벤트 없음 (초과: ' + (ghostDoc.join(',') || '없음') + ')');
  // 네거티브 자기 검사 — 이 비교기가 가짜 이벤트를 실제로 잡는지(잡지 못하면 게이트 자체가 무의미)
  ok([...docEvents, 'zz_fake_event'].filter(e => !codeEvents.includes(e)).length > 0, '계측 사전: 비교기 네거티브 자기 검사(가짜 이벤트 감지)');
  // 산출물 정의 단일 진실 — labels.js OUTPUT_EVENTS 전부가 문서 표에 존재
  try {
    const { OUTPUT_EVENTS } = require(path.join(__dirname, 'modelter-labels'));
    const outMissing = OUTPUT_EVENTS.filter(e => !docEvents.includes(e));
    ok(outMissing.length === 0, '계측 사전: OUTPUT_EVENTS(산출물 12종) 전부 문서화 (누락: ' + (outMissing.join(',') || '없음') + ')');
  } catch (e) { ok(false, '계측 사전: modelter-labels 로드 (' + e.message + ')'); }
  ok(md.includes('blob10') && md.includes('봇 제외'), '계측 사전: 분모 규칙(봇 제외·blob10) 명시');
  const aeSrc3 = fs.readFileSync(path.join(__dirname, 'modelter-ae.js'), 'utf8');
  ok(aeSrc3.includes('SNAP_SCHEMA') && aeSrc3.includes('validateSnap') && aeSrc3.includes('botExcluded'), '스냅샷: 스키마 버전 + 쓰기 전 검증 + botExcluded 표시');
}

/* ── 1j) 사용성 v3(로그 기반) — 복잡도 다이어트·조정 바·위저드 발견성 ── */
ok(html.includes('details.fsub') && html.includes('class="fsub"'), '사용성: 세부 항목 접기(fsub) 존재');
ok((html.match(/adv:true/g) || []).length >= 20, '사용성: 세부 필드 지정(adv:true) 20+ (' + (html.match(/adv:true/g) || []).length + '곳)');
ok(html.includes("mtTrack('fsub_open')"), '사용성: fsub 펼침 계측');
ok(html.includes('fgroup adv collapsed'), '사용성: adv 그룹 기본 접힘(사업비 세부)');
ok(html.includes("sessionStorage.getItem('mt_adjauto')"), '사용성: 조정 바 데스크톱 1회 자동 오픈');
ok(html.includes('!window.__adjAuto && window.mtTrack'), '사용성: 자동 오픈은 adj_open 미집계(지표 오염 방지)');
ok(html.includes('조정 바 ± 조작 = 자기 숫자 만지기'), '사용성: 조정 바 조작 → activate 신호');
ok(html.includes('.wiz-launch{flex:1 1 100%'), '사용성: 모바일 위저드 버튼 승격(전폭·강조)');
ok(html.includes('const DEAL_SOON=') && html.includes('deal-soon'), '수요 가짜 문: 준비 중 딜 타일(DEAL_SOON) 존재');
ok(html.includes("track('deal_want'"), '수요 가짜 문: deal_want 수집(딜 유형명만)');
{
  // 무전송 불변 재확인 — src·deal_want 는 채널명/딜유형명만, 수치·PII 금지
  const workerSrc = fs.existsSync(path.join(__dirname, '..', 'worker.js')) ? fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8') : '';
  ok(/const\s+src\s*=\s*s\(d\.src,\s*8\)\.replace\(\/\[\^A-Za-z0-9_\]/.test(workerSrc), 'worker.js: src 화이트리스트(영문·숫자·_ 8자) 정화');
}

/* ── 1d) 산출물 회수 루프(E2) — 회수 링크·QR·착지 CTA ── */
ok(html.includes('function shareLink(readonly, src)') && html.includes('var SRC_CHANNELS='), '회수: shareLink(readonly,src) 채널 태그 화이트리스트');
ok(html.includes('function recoverUrl(src)') && html.includes("function recoverOn()"), '회수: 옵트인(recoverOn)·회수 URL 생성기');
ok(html.includes('id="recoverChk"') && html.includes('id="recoverOpt"'), '회수: 산출물 링크 옵트인 체크박스(기본 켜짐)');
ok(html.includes('if(c.link){ links.push') && html.includes('officeDocument/2006/relationships/hyperlink') && html.includes('TargetMode="External"'), '회수: XLSXGEN 하이퍼링크(시트 rels·External) 지원');
ok(html.includes("recoverUrl('xlsx')") && html.includes('modelter.com에서 이 모델 열기'), '회수: 엑셀 표지 「이 모델 열기」 하이퍼링크 셀(&src=xlsx)');
ok(html.includes("recoverUrl('png')") && html.includes('스캔 → 이 모델 열기'), '회수: PNG 요약 카드 QR(&src=png)');
ok(html.includes("shareLink(false,'qr')"), '회수: QR 이어가기 링크 &src=qr');
ok(html.includes('id="roCta"') && html.includes('id="roCtaBtn"') && html.includes('이 가정으로 내 딜 시작하기'), '회수: 읽기전용 착지 하단 CTA 바');
ok(html.includes("mtTrack('recover_cta'"), '회수: recover_cta 이벤트(착지→편집 전환)');
ok(html.includes('이 모델을 바로 열어 보기:') && html.includes('요약 카드(PNG)의 QR'), '회수: IC PPT 마지막 장 회수 안내(라이브·QR 경로)');

/* ── 1e) 팀 기준 배포 링크(E4) — #h= 내보내기·미리보기·적용·표기 ── */
ok(html.includes('function houseShareLink()') && html.includes("location.pathname+'#h='+enc"), '팀 기준: #h= 배포 링크 생성(회사 표준 파라미터만)');
ok(html.includes('function houseImportPreview(pay)') && html.includes("data-hi=\"apply\""), '팀 기준: 설치 미리보기 모달(자동 적용 금지)');
ok(html.includes('var mHouse=h.match(/[#&]h=([^&]+)/)'), '팀 기준: #h= 착지 파싱(딜 복원과 분리)');
ok(html.includes("data-hs=\"share\"") && html.includes("mtTrack('house_share')"), '팀 기준: 팀에 배포 버튼 + house_share 이벤트');
ok(html.includes("mtTrack('house_apply')"), '팀 기준: 적용 시 house_apply 이벤트');
ok(html.includes('function houseName()') && html.includes('function houseTag()'), '팀 기준: 팀명 라벨·산출물 표기 헬퍼');
ok(html.includes("_b2h.s+=' · '+_ht") || html.includes("+' · '+_ht"), '팀 기준: 엑셀 표지에 팀 기준 표기');
ok(html.includes("'✓ '+_ptag") || html.includes('✓ '+"'+_ptag"), '팀 기준: IC PPT 표지에 팀 기준 배지');
ok(!html.includes("var hNm=hOn?'사내 기준 '"), '팀 기준: 판정 리드 팀명 격상(사내 기준 하드코딩 제거)');

/* ── 1f) 검색 착지 페이지(E3) — 생성기 최신성·링크 무결성·JSON-LD ── */
{
  const genPath = path.join(__dirname, 'gen-pages.js');
  ok(fs.existsSync(genPath), '검색 착지: 생성기(gen-pages.js) 존재');
  // 생성 결과가 guide.html·TERM_META 와 어긋나지 않는지(빌드 없이 커밋 원칙 강제)
  if (fs.existsSync(genPath)) {
    let fresh = true, out = '';
    try { out = require('child_process').execSync('node ' + JSON.stringify(genPath) + ' --check', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { fresh = false; out = (e.stdout || '') + (e.stderr || ''); }
    ok(fresh, '검색 착지: 생성 페이지가 최신(gen-pages --check) — 실패 시 `node tools/gen-pages.js` 재생성 후 커밋' + (fresh ? '' : '\n     ' + out.trim().split('\n').slice(0, 4).join('\n     ')));
  }
  const tDir = path.join(DIR, 't'), cDir = path.join(DIR, 'calc');
  const tFiles = fs.existsSync(tDir) ? fs.readdirSync(tDir).filter(f => f.endsWith('.html')) : [];
  const cFiles = fs.existsSync(cDir) ? fs.readdirSync(cDir).filter(f => f.endsWith('.html')) : [];
  ok(tFiles.length >= 24, '검색 착지: 용어 페이지 24+ (' + tFiles.length + '개)');
  // 실딜 4종 + 준비 중 딜 착지면(수요 선점, 예: hotel). 실딜 4종은 반드시 존재해야 한다.
  const realCalc = ['office', 'logistics', 'dev', 'refi'].filter(k => cFiles.includes(k + '.html'));
  ok(realCalc.length === 4 && cFiles.length >= 4, '검색 착지: 계산기 페이지 실딜 4종 + 준비중 ' + (cFiles.length - 4) + '개 (총 ' + cFiles.length + '개)');
  // sitemap 에 새 URL 등록 수 일치
  if (fs.existsSync(path.join(DIR, 'sitemap.xml'))) {
    const sm = fs.readFileSync(path.join(DIR, 'sitemap.xml'), 'utf8');
    const locN = (sm.match(/<loc>/g) || []).length;
    const baseN = 5;  // 홈·guide·howto·trust·verification
    const nDir = path.join(DIR, 'notes');
    const nN = fs.existsSync(nDir) ? fs.readdirSync(nDir).filter(f => f.endsWith('.html')).length : 0;
    ok(locN === baseN + tFiles.length + cFiles.length + nN, 'sitemap: 착지 페이지 전수 등록 (' + locN + '개 = ' + baseN + '기본+' + tFiles.length + '용어+' + cFiles.length + '계산기+' + nN + '노트)');
    ok(sm.includes('/t/irr<') && sm.includes('/calc/office<'), 'sitemap: 용어·계산기 URL 포함(무확장)');
  }
  // 링크 무결성 + canonical + JSON-LD + CTA (전 페이지)
  let jsonBad = 0, canonBad = 0, ctaBad = 0, linkBad = 0;
  const allPages = tFiles.map(f => 't/' + f).concat(cFiles.map(f => 'calc/' + f));
  const existsPage = p => fs.existsSync(path.join(DIR, p));
  for (const rp of allPages) {
    const ph = fs.readFileSync(path.join(DIR, rp), 'utf8');
    const jm = ph.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    try { JSON.parse(jm[1]); } catch (e) { jsonBad++; }
    if (!/rel="canonical" href="https:\/\/modelter\.com\//.test(ph)) canonBad++;
    // 앱 CTA + seo 귀속. 준비 중 딜 착지면(호텔 등)은 열 딜 탭이 없어 딜 인자 없이 `#src=seo` 형태를 허용.
    if (!/href="\/#(t=(office|logistics|dev|refi)&)?src=seo"/.test(ph)) ctaBad++;
    for (const mm of ph.matchAll(/href="\/(t|calc)\/([a-z0-9]+)"/g)) if (!existsPage(mm[1] + '/' + mm[2] + '.html')) linkBad++;
  }
  ok(jsonBad === 0, '검색 착지: 전 페이지 JSON-LD 유효 (' + jsonBad + ' 실패)');
  ok(canonBad === 0, '검색 착지: 전 페이지 canonical (' + canonBad + ' 누락)');
  ok(ctaBad === 0, '검색 착지: 전 페이지 앱 CTA(#t=…&src=seo) (' + ctaBad + ' 누락)');
  ok(linkBad === 0, '검색 착지: 내부 링크 무결성 (' + linkBad + ' 깨짐)');
}

/* ── 1g) 재현성 스탬프 + 파리티 공표(E6) ── */
ok(html.includes("window.MT_BUILD=") && html.includes('function mtBuild()'), '재현성: 빌드 스탬프 상수(MT_BUILD)·헬퍼');
ok(fs.existsSync(path.join(__dirname, 'stamp-build.js')), '재현성: 빌드 스탬프 스크립트(stamp-build.js)');
ok(fs.existsSync(path.join(__dirname, 'gen-verification.js')), '재현성: 파리티 공표 생성기(gen-verification.js)');
ok(fs.existsSync(path.join(DIR, 'verification.html')), '재현성: /verification 페이지 존재');
// 4산출물 스탬프 표기 코드 경로
ok(html.includes("'  ·  build '+mtBuild()"), '재현성: PNG 요약 카드 빌드 스탬프');
ok(html.includes("' · 빌드 '+mtBuild()"), '재현성: 엑셀 자가검증 시트 빌드 스탬프');
ok(html.includes("' · 빌드 '+mtBuild())") || html.includes("(' · 빌드 '+mtBuild())"), '재현성: IC PPT 표지 빌드 스탬프');
ok(html.includes("'※ 생성 빌드 '+mtBuild()"), '재현성: 검토 메모 빌드 스탬프');
if (fs.existsSync(path.join(DIR, 'verification.html'))) {
  const vf = fs.readFileSync(path.join(DIR, 'verification.html'), 'utf8');
  ok(/rel="canonical" href="https:\/\/modelter\.com\/verification"/.test(vf), '재현성: verification canonical');
  ok(vf.includes('gen-xlsx.js') && vf.includes('check.py') && vf.includes('formulas'), '재현성: verification 재현 절차(gen-xlsx·check.py·formulas)');
  ok(vf.includes('빌드 <b>'), '재현성: verification 빌드 식별자 표기');
  // "전 딜 파리티" 표현의 정직성 — 공개 표에 4딜(리파이 포함) 전부 존재해야 함
  ok(vf.includes('오피스 매입') && vf.includes('물류센터 매입') && vf.includes('분양 사업수지') && vf.includes('리파이낸싱 비교'), '재현성: verification 표에 4딜 전부(리파이 포함)');
  const chk = fs.readFileSync(path.join(__dirname, 'parity', 'check.py'), 'utf8');
  ok(chk.includes("'refi'") && chk.includes('02_Term_Sheets'), '재현성: check.py가 refi 셀 검증 지원(전 딜 파리티 실검증)');
}
/* 산출물 개수 문구 ↔ 코드 진실 정합 (vNext 문제 H) — 페이지마다 다른 장수/시트 수 표기를 차단 */
{
  const icM = html.match(/raw=r\.raw\|\|\{\},\s*total=(\d+)/);   // ICPPT 실제 슬라이드 수
  ok(!!icM, '메타 정합: ICPPT total=N 슬라이드 수 파싱');
  if (icM) {
    const n = icM[1];
    const claims = [...html.matchAll(/IC 패키지 (\d+)장/g)].map(m => m[1]);
    ok(claims.length > 0 && claims.every(c => c === n), '메타 정합: 앱 "IC 패키지 N장" 문구 전부 코드와 일치 (' + n + '장, ' + claims.length + '곳)');
    const hw2 = fs.existsSync(path.join(DIR, 'howto.html')) ? fs.readFileSync(path.join(DIR, 'howto.html'), 'utf8') : '';
    const hwClaims = [...hw2.matchAll(/(\d+)장짜리 IC|IC 패키지[^0-9]{0,6}(\d+)장/g)].map(m => m[1] || m[2]);
    ok(hwClaims.every(c => c === n), '메타 정합: howto의 IC 장수 표기 일치 (' + (hwClaims.join(',') || '언급 없음') + ')');
  }
  // 분양 워크북 시트 수 — 앱 내 표기가 서로 일치해야 함(코드 주석 포함)
  const devSheets = [...html.matchAll(/분양 사업수지[^(]{0,10}\((\d+)시트/g)].map(m => m[1]);
  ok(devSheets.length === 0 || devSheets.every(c => c === devSheets[0]), '메타 정합: 분양 워크북 시트 수 표기 상호 일치 (' + devSheets.join(',') + ')');
}

// 빌드 스탬프 무결성 — 스탬프됐다면 콘텐츠 해시와 일치해야 함(스탬프 후 변조 방지). DEV(미스탬프)는 통과.
{
  let stampOK = true, stampMsg = '';
  try { stampMsg = require('child_process').execSync('node ' + JSON.stringify(path.join(__dirname, 'stamp-build.js')) + ' --check', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (e) { stampOK = false; stampMsg = ((e.stdout || '') + (e.stderr || '')).trim(); }
  ok(stampOK, '재현성: 빌드 스탬프 무결성 — ' + stampMsg.split('\n')[0]);
}

/* ── 1h) 참고치 v3(E7) — 데이터셋 유래·출처·기준일 ── */
ok(fs.existsSync(path.join(__dirname, '..', 'data', 'market-ref.json')), '참고치: 데이터셋(data/market-ref.json) 존재');
ok(fs.existsSync(path.join(__dirname, 'gen-marketref.js')), '참고치: 인라인 생성기(gen-marketref.js) 존재');
ok(html.includes('/*__MKTREF_START__*/') && html.includes('/*__MKTREF_END__*/'), '참고치: 인라인 마커(런타임 fetch 아님)');
ok(html.includes('const MARKET_REF_ASOF=') && html.includes('const FIELD_REF_META='), '참고치: 기준일·출처 메타(FIELD_REF_META) 인라인');
ok(html.includes('function fieldRefMeta(k)') && html.includes('class="f-src"'), '참고치: 칩 출처·기준일 뱃지(fieldRefMeta·f-src)');
ok(!/https?:\/\/[^"']*market-ref\.json/.test(html), '참고치: 런타임 외부 fetch 0(데이터셋 URL 미참조)');
if (fs.existsSync(path.join(__dirname, 'gen-marketref.js'))) {
  let mrOK = true, mrMsg = '';
  try { mrMsg = require('child_process').execSync('node ' + JSON.stringify(path.join(__dirname, 'gen-marketref.js')) + ' --check', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (e) { mrOK = false; mrMsg = ((e.stdout || '') + (e.stderr || '')).trim(); }
  ok(mrOK, '참고치: 인라인이 데이터셋과 일치(gen-marketref --check) — ' + mrMsg.split('\n')[0]);
  // 출처가 공개 기준·관행 표기인지(임의 URL·시세 표현 아님) 가벼운 확인
  try {
    const mr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'market-ref.json'), 'utf8'));
    const srcs = []; const collect = o => Object.values(o).forEach(v => v && v.src && srcs.push(v.src));
    collect(mr.common || {}); Object.values(mr.deal || {}).forEach(collect);
    ok(srcs.length > 0 && srcs.every(s => !/https?:\/\//.test(s)), '참고치: 출처는 공개 기준·관행 표기(외부 URL·시세 아님)');
  } catch (e) { ok(false, '참고치: market-ref.json 파싱'); }
}

/* ── 1i) 분기 시장 노트(E8) — 데이터셋 동기화 콘텐츠 퍼널 ── */
ok(fs.existsSync(path.join(__dirname, 'gen-notes.js')), '분기 노트: 생성기(gen-notes.js) 존재');
{
  const nDir = path.join(DIR, 'notes');
  const notes = fs.existsSync(nDir) ? fs.readdirSync(nDir).filter(f => f.endsWith('.html')) : [];
  ok(notes.length >= 1, '분기 노트: notes/*.html 존재 (' + notes.length + '개)');
  let nBad = 0, nSrc = 0, nCanon = 0, nDisc = 0;
  for (const f of notes) {
    const nh = fs.readFileSync(path.join(nDir, f), 'utf8');
    try { JSON.parse((nh.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]); } catch (e) { nBad++; }
    if (/href="https:\/\/modelter\.com\/#v=[A-Za-z0-9_-]+&src=notes"/.test(nh)) nSrc++;
    if (/rel="canonical" href="https:\/\/modelter\.com\/notes\//.test(nh)) nCanon++;
    if (nh.includes('투자 권유가 아닌')) nDisc++;
  }
  ok(nBad === 0, '분기 노트: JSON-LD(Article) 유효 (' + nBad + ' 실패)');
  ok(nSrc === notes.length, '분기 노트: 사전 입력 링크(#v=…&src=notes) 존재');
  ok(nCanon === notes.length, '분기 노트: canonical');
  ok(nDisc === notes.length, '분기 노트: 투자 권유 아님 고지');
  // 사전 입력 링크가 앱 코덱으로 실제 디코드되는지(브라우저 호환) — mtLZ 추출 왕복
  if (notes.length) {
    try {
      const appHtml = fs.readFileSync(HTML, 'utf8');
      const mLZ = appHtml.match(/var mtLZ=(\(function\(\)\{[\s\S]*?return \{compress:compress, decompress:decompress\};\s*\}\)\(\));/);
      const mtLZ = new Function('return ' + mLZ[1])();
      const enc = fs.readFileSync(path.join(nDir, notes[0]), 'utf8').match(/#v=([A-Za-z0-9_-]+)&src=notes/)[1];
      const p = JSON.parse(mtLZ.decompress(enc));
      ok(p && p.c && p.s && Object.keys(p.s).length > 3, '분기 노트: 사전 입력 링크가 앱 코덱으로 디코드(딜=' + p.c + ')');
    } catch (e) { ok(false, '분기 노트: 사전 입력 링크 디코드 — ' + e.message); }
  }
  // 최신성(데이터셋 동기화) 게이트
  let gnOK = true, gnMsg = '';
  try { gnMsg = require('child_process').execSync('node ' + JSON.stringify(path.join(__dirname, 'gen-notes.js')) + ' --check', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (e) { gnOK = false; gnMsg = ((e.stdout || '') + (e.stderr || '')).trim(); }
  ok(gnOK, '분기 노트: 데이터셋과 동기화(gen-notes --check) — ' + gnMsg.split('\n')[0]);
}
const headersPath = path.join(DIR, '_headers');
ok(fs.existsSync(headersPath), '_headers 존재');
if (fs.existsSync(headersPath)) {
  const h = fs.readFileSync(headersPath, 'utf8');
  ok(/content-security-policy/i.test(h), '_headers: CSP 포함');
  ok(/x-frame-options/i.test(h), '_headers: X-Frame-Options 포함');
  ok(/Cache-Control:\s*no-cache/.test(h), '_headers: HTML 재검증 캐시 정책(구버전 고착 방지)');
  // 앱이 api.anthropic.com을 호출(BYOK)하면 CSP connect-src에도 반드시 있어야 함 — 로컬 QA엔 CSP가 없어 프로덕션에서만 터지는 유형
  if (html.includes('api.anthropic.com')) ok(/connect-src[^;]*api\.anthropic\.com/.test(h), '_headers: CSP connect-src에 api.anthropic.com (BYOK 차단 방지)');
}
ok(/\.xl-dl\[hidden\]\{display:none\}/.test(html), 'CSS: .xl-dl[hidden] 가드(엑셀버튼 숨김 버그 방지)');
ok(/_hesc\(h\)/.test(html) && /_hesc\(samples/.test(html) && /_hesc\(w\.msg\)/.test(html), '렌트롤 헤더·샘플·경고 XSS 이스케이프 유지');
ok(html.includes('id="miniKpi"'), '미니 결과(IRR·CoC) 위젯 존재');
ok(html.includes('id="wnOverlay"'), "What's new 팝업 존재");
ok((html.match(/trn-pref/g) || []).length >= 1, '우선주·보통주 트랜치 블록 존재');
ok(/window\.mtTrack\s*=\s*track/.test(html), '익명 사용 이벤트 트래킹 스니펫 존재');
ok((html.match(/IRRat:IRRat/g) || []).length >= 2, '세후 IRR 계산(calcModel·leaseModelV2) 존재');
ok(html.includes('Levered IRR (세후)'), '비도관 세후 IRR KPI 존재');
ok(html.includes('id="mdOverlay"'), '방법론(가정·계산식) 모달 존재');
ok((html.match(/k:"prepayfee"/g) || []).length >= 2 && (html.match(/k:"dispfee"/g) || []).length >= 2, '중도상환수수료·매각성과보수 입력(오피스·물류) 존재');
ok(html.includes('06_Tax_Disposition!C19-06_Tax_Disposition!C20'), '엑셀 워터폴에서 매각 부대비 차감(엑셀 파리티)');
ok((html.match(/perfR/g) || []).length >= 2, '화면 매각 부대비 계산(calcModel·leaseModelV2) 존재');
ok((html.match(/k:"vacancy"/g) || []).length >= 2, '공실률 입력(오피스·물류) 존재');
ok((html.match(/prefCum/g) || []).length >= 2, '우선주 누적배당 계산(calcModel·leaseModelV2) 존재');
ok(html.includes('우선주 누적 미지급'), '엑셀 워터폴 우선주 누적 미지급 행(엑셀 파리티)');
ok(/leasearea:\[/.test(html) && /netarea:\[/.test(html), '렌트롤 전용/임대면적 분리 인식(파서)');
ok(html.includes("rentable=gfa*n('leaseRatio'"), '렌트롤 공실 = 임대가능면적(GFA×비율) 기준');
ok((html.match(/임대면적\(평\)/g) || []).length >= 2, '렌트롤 임대면적 컬럼(샘플·엑셀)');
ok((html.match(/depSrc/g) || []).length >= 2, '보증금 승계 계산(calcModel·leaseModelV2) 존재');
ok(html.includes('보증금 승계 (1=반영)'), '엑셀 보증금 승계 셀(C74)');
ok((html.match(/k:"depassume"/g) || []).length >= 2, '보증금 승계 입력(오피스·물류) 존재');
ok((html.match(/feeY/g) || []).length >= 2, '운용보수·고정비 계산(calcModel·leaseModelV2) 존재');
ok(html.includes('운용보수율(취득가)'), '엑셀 운용보수 셀(C76/C78)');
ok((html.match(/k:"opfee"/g) || []).length >= 2, '운용보수 입력(오피스·물류) 존재');
ok(html.includes('window.__setSensAxis'), '민감도 축 토글(성장률/금리) 존재');
ok(html.includes("What's new · v3"), "What's new 팝업 v3");
ok(html.includes("function loadSampleDeal"), "샘플 딜 로더 존재");
ok(html.includes("MT_SAMPLES"), "샘플 딜 데이터(가짜 임차인) 존재");
ok(html.includes("function rrDisplayName"), "임차인명 비식별 헬퍼 존재");
ok(html.includes('function holdTemplate'), '변동 보유기간 엑셀 생성기(holdTemplate) 존재');
ok((html.match(/t:"range"/g) || []).length >= 2, '보유기간 슬라이더(오피스·물류) 존재');
ok(html.includes('function mtHold'), '보유기간 헬퍼(mtHold) 존재');
ok(html.includes('function putS'), 'holdTemplate 헤더·2차지표 재생성 존재');
ok(/depExit/.test(html), '보증금 성장 정산(depExit) 존재');
ok(html.includes('function computeForSnapshot'), '딜 비교 순수계산 래퍼(computeForSnapshot) 존재');
ok(html.includes('function renderCompare'), '딜 비교 렌더러(renderCompare) 존재');
ok(html.includes('id="cmpOverlay"'), '딜 비교 모달 존재');
ok(html.includes('class="ps-kpis"'), 'IC 원페이저 KPI 스트립 존재');
ok(html.includes('class="ps-stack"'), 'IC 원페이저 자본구조(트랜치) 섹션 존재');
ok(/class="ps-sens"/.test(html), 'IC 원페이저 민감도 히트맵 섹션 존재');
ok((html.match(/NOI\[y\]-INT\[y\]-depY-feeY/g)||[]).length>=2, '세무 손금산입: 과세소득 = NOI−이자−감가−운용보수(화면 2엔진)');
ok(html.includes('C5-C6-C7-01_Assumptions!$C$78'), '엑셀 기본템플릿 과세소득에 운용보수 손금산입');
ok(html.includes("c+'7-'+A+'$C$78'"), 'holdTemplate 과세소득에 운용보수 손금산입(변동 보유)');
ok(html.includes('01_Assumptions!$C$75*POWER(1+01_Assumptions!$C$27,01_Assumptions!$C$79)'), '엑셀 기본템플릿 보증금 성장 정산(P0-3 완결)');
ok(html.includes('prt-flag'), '파리티 배지(화면=엑셀) 존재');
ok(html.includes('화면 = 다운로드 엑셀'), '파리티 배지 라벨');
ok(html.includes('<h4>화면 = 다운로드 엑셀</h4>'), '방법론 모달 화면=엑셀 일치 섹션 존재');
ok(html.includes('function validateLeases'), '렌트롤 행 단위 검증(validateLeases) 존재');
ok(html.includes('id="rrWarns"'), '렌트롤 검증 경고 영역 존재');
ok(html.includes('rr-maptbl'), '렌트롤 매핑 확인 표 존재');
ok(html.includes('function rrRiskMetrics'), '임대차 리스크 지표(rrRiskMetrics) 존재');
ok(html.includes('id="rrRiskCard"'), '임대차 리스크 카드 존재');
ok(html.includes("name:'Lease_Risk'"), '엑셀 Lease_Risk 시트 존재');
ok(html.includes('function mtChecks'), '체크 레지스트리(mtChecks) 존재');
ok(html.includes('global.TEASER='), '원페이지 티저 모듈 존재');
ok(html.includes('id="tzDownload"'), '티저 버튼 존재(엑셀 옆 1/3)');
ok(html.includes('TPL_B64'), '티저 PPT 양식 내장');
ok(html.includes('global.ICPPT=') && html.includes('id="icDownload"'), 'IC 패키지(멀티슬라이드 PPT) 존재');
ok(html.includes("mtTrack('ic_ppt')"), 'IC 패키지 이벤트 추적');
ok(html.includes('function heatFill') && html.includes('function tile'), 'IC 패키지 v2: KPI 타일·민감도 히트맵');
ok(html.includes('IC 패키지 7장'), 'IC 패키지 7장 구성(표지·요약·구조·가정·CF·민감도·점검)');
ok(html.includes('window.MTIM=') && html.includes('class="im-btn"'), 'IM 가정 추출(BYOK) 존재');
ok(html.includes('anthropic-dangerous-direct-browser-access'), 'BYOK: 브라우저 직접 호출(서버 무경유)');
ok(html.includes("tool_choice:{type:'tool', name:'extract'}"), 'BYOK: tool_choice로 구조화 추출 강제');
ok(html.includes('서버로는 어떤 내용도 전송·저장되지 않습니다'), 'BYOK: 개인정보·보안 고지 문구');
ok(!html.includes("localStorage.setItem('mt_byok"), 'BYOK: 키를 localStorage에 저장하지 않음(세션만)');
ok(html.includes('문서에 없으면 null (추측 금지)'), 'BYOK: 추측 금지 추출 규칙');
ok(html.includes('MTIM.checklist()') && html.includes('IM에서 찾을 숫자'), 'IM 체크리스트(키 없이 시작) 존재');
ok(html.includes('function localExtract') && html.includes('MTIM.quick()'), 'IM 무키 로컬 자동 인식 존재');
ok(html.includes('이 기능은 네트워크를 사용하지 않습니다'), 'IM 무키 무전송 고지 존재');
ok(html.includes('보수적으로 눌러 보면'), '판정 다운사이드 한 줄 존재');
ok(html.includes('let exampleKeys=new Set()') && html.includes('function exConfirmOutput'), '예시값 잔존 추적 + 산출물 확인 존재');
ok(html.includes('id="exChip"') && html.includes('(일부 가정은 예시값)'), '예시값 칩 + 한 줄 보고 꼬리표');
ok((html.match(/ek:Array\.from\(exampleKeys\)/g)||[]).length>=3, '예시 추적 저장·공유·버전 왕복(3경로)');
// PASS/FAIL 수식은 _row() 헬퍼가 행 번호로 조립한다(무차입 등 정의되지 않는 지표는 '해당 없음'으로 우회).
ok(html.includes('자가 검증 — 생성 시점 웹 계산값') && /IF\(ABS\(C'\+r\+'-D'\+r\+'\)<'\+cmp\+',"PASS","FAIL"\)/.test(html)
  && html.includes("_row(19,'세전 IRR"), '엑셀 자가 검증 스탬프(11시트 PASS/FAIL) 존재');
ok(html.includes('isFinite(c.n)') && /\+_nv\+'<\/v><\/c>'/.test(html), '엑셀 숫자 셀 비유한값 가드(파일 손상 방지)');
ok((html.match(/IFERROR\(04_Operating_ProForma!'\+c\+'18/g) || []).length >= 3, '엑셀 커버리지 지표 0 분모 가드(DSCR·ICR·DY)');
// IRR은 현금흐름이 부호를 바꾸지 않으면 #NUM! 을 낸다 — 표지까지 새지 않도록 전부 IFERROR로 감싼다.
ok(!/"f":"IRR\(/.test(html) && (html.match(/IFERROR\(IRR\(08_Equity_Cashflow/g) || []).length >= 4,
  '엑셀 IRR 수식 #NUM! 가드(템플릿·동적 재생성 양쪽)');
// 조달 합계에서 승계 보증금이 빠지면 검증 시트가 스스로 'Uses=Sources FAIL' 을 띄운다.
ok((html.match(/IF\(01_Assumptions!\$C\$74=1,01_Assumptions!\$C\$75,0\)/g) || []).length >= 4,
  '엑셀 조달(Sources)에 승계 보증금 포함 — 표지·S&U·캐피털스택·검증');
ok(/function wOf\(id,amt\)\{ if\(r\.uses>0/.test(html) && html.includes('trn-dep'),
  '화면 트랜치 비중 = 금액÷Uses (합 100%, 보증금 승계 포함)');
ok(html.includes('만기에 갚을 잔액') && html.includes('통상 잡는 LTV 60%'), '만기 차환 갭 테스트 한 줄 존재');
ok(html.includes('function wsDupDeal') && html.includes('data-ws="dup"'), '딜 복제(새 딜 시작) 존재');
ok(html.includes('function myDefSave') && html.includes("localStorage.getItem('mt_mydef')"), '내 기본값 프리셋(딜 유형별) 존재');
ok(html.includes('data-sh="1"') && html.includes('navigator.share'), 'Web Share 공유 시트 옵션 존재');
ok(html.includes('function reviewMemo') && html.includes('data-memo="1"'), '검토 메모 초안(메일 본문) 존재');
ok(html.includes('function wsDiffSnaps') && html.includes('data-ws="diff"'), '버전 간 가정 diff 존재');
ok(html.includes('function scenarioTable') && html.includes('window.__mtScenario=function'), '시나리오 비교(Base/보수/낙관 전 지표) 존재');
ok(html.includes('function renderAdjBar') && html.includes('id="adjBar"'), '미팅용 즉석 조정 바 존재');
ok(html.includes('function summaryCardPNG') && html.includes('임차인 정보 미포함'), '요약 카드 PNG(고지 포함) 존재');
ok(html.includes('function wsLinkDiff') && html.includes('data-ws="lcmp"'), '공유 링크 2개 가정 diff 존재');
ok(html.includes('function cmpTableText') && html.includes('data-cmp='), '딜 비교 대상 선택 + 비교표 복사 존재');
ok(html.includes('function srcPop') && html.includes('var srcTags={}') && (html.match(/st:srcTags\}/g)||[]).length>=3, '가정 출처·기준일 기록(3경로 영속) 존재');
ok(html.includes("name:'_Restore'") && html.includes('wsXlsxRestore') && html.includes('MTSNAP1:'), '엑셀 라운드트립(_Restore 시트+복원 입력) 존재');
ok(html.includes('거치후 원리금균등') && html.includes("n('C80',0)"), '거치후 원리금균등 상환(엔진+엑셀 C80) 존재');
ok(html.includes('cov-lender') && html.includes('금리 × 공실 결합 스트레스'), '매입 대주 뷰(금리×공실 스트레스) 존재');
ok(html.includes('function renderCoach') && html.includes('mt_coach'), '첫 결과 코치마크(1회) 존재');
ok(html.includes('function wsPipelineReport') && html.includes("WS_STATUSES=['검토중'"), '딜 상태 태그+파이프라인 보고 존재');
ok(html.includes('function housePop') && html.includes("localStorage.getItem('mt_house')"), '하우스 기준(내 허들) 존재');
ok(html.includes('__setDevSensAxis') && html.includes("'공사비 조정'"), '분양 공사비 스트레스 축 존재');
ok(html.includes('function checkAssumptions') && html.includes('function inquiryText'), '가정 적정성 점검+검토 질의서 존재');
ok(html.includes("props['evidence']") && html.includes('근거 원문'), 'AI 추출 근거 원문 표시 존재');
ok(html.includes("'sellerirr'") && html.includes('매도자 제시 IRR'), '매도자 제시치 대조 존재');
ok(html.includes('function imgToB64') && html.includes("id=\"imxImg\""), '사진(비전) IM 추출 존재');
ok(html.includes('rel="manifest"') && html.includes("navigator.serviceWorker.register('/sw.js')"), 'PWA(manifest+SW 등록) 존재');
ok(html.includes('Kazuhiko Arase') && html.includes('function qrPop'), 'QR 이어가기(MIT 인코더 내장) 존재');
ok(html.includes('결과부터 보이게') || html.includes('입력 폼이 아니라 결과부터'), '읽기 전용 모바일 결과 우선 착지 존재');
ok((html.match(/prefEM:\(prefAmt>0/g)||[]).length>=2, '우선주 EM 노출(2엔진)');
ok(html.includes('function mtBisect'), '역산 솔버(mtBisect) 존재');
ok(html.includes('function solveBidPrice'), '목표 IRR 매입가 역산 존재');
ok(!html.includes('mtQuality') && !html.includes('renderCases'), '가정 신뢰도·케이스 카드 제거 확인');
ok(html.includes('id="solverCard"'), '역산 카드 존재');
ok(html.includes('function _covBlock'), '부채 커버넌트 표(_covBlock) 존재');
ok(html.includes('INT:INT,endBal:endBal,exitCap:'), '엔진 INT·endBal·exitCap 노출(2엔진)');
ok((html.match(/INT:INT,endBal:endBal,exitCap:/g)||[]).length>=2, '두 엔진 모두 노출');
ok(html.includes('04_Operating_ProForma!C18/C6'), '엑셀 05 ICR 행');
ok(html.includes('04_Operating_ProForma!C18/C8'), '엑셀 05 Debt Yield 행');
ok(html.includes('Exit Cap ≥ 진입 Cap − 0.5%p'), '엑셀 11 검증: 역스프레드 체크');
ok(html.includes('feats:featSnapshot()'), '이벤트 스키마: 활성기능 스냅샷(feats) 전송');
ok(html.includes("track('share_link')") && html.includes("track('pdf_export')") && html.includes("track('slot_save')"), '이벤트: 공유·PDF·보관함 액션 추적');
ok(html.includes("mtTrack('sens_axis'"), '이벤트: 민감도 축 토글 추적');
ok(html.includes("var WS_KEY='mt_deals'"), '딜 워크스페이스 저장 키(mt_deals) 존재');
ok(html.includes('function wsDB'), '딜 워크스페이스 저장소(wsDB) 존재');
ok(html.includes('function wsHash'), '스냅샷 해시(wsHash) 존재');
ok(html.includes('function wsAddVersion'), '버전 추가(wsAddVersion) 존재');
ok(html.includes('function wsApplySnapshot'), '버전 복원(wsApplySnapshot) 존재');
ok(html.includes('function wsWithSnapshot'), '버전 기준 산출물 재생성 래퍼(wsWithSnapshot) 존재');
ok(html.includes('function wsMigrateSlots'), '기존 보관함(mt_slots) 이관 존재');
ok(html.includes("MODELTER_DEAL_EXPORT"), '.modelter 내보내기 형식 존재');
ok(html.includes('function wsImportFile'), '.modelter 가져오기(wsImportFile) 존재');
ok(html.includes('id="wsOverlay"'), '워크스페이스 패널 모달 존재');
ok(html.includes('id="wsDirtyTag"'), '저장 안 된 변경 표시(dirty tag) 존재');
ok(html.includes('function renderWsPanel'), '워크스페이스 패널 렌더러 존재');
ok(html.includes('function downloadXlsx(ctx)'), '엑셀 다운로드 버전 컨텍스트 지원');
ok(html.includes('function simDevResi'), '공동주택 분양 월별 사업수지 엔진 존재');
ok(html.includes('function devGridsHtml'), '평형/상업시설 분양 그리드 존재');
ok(html.includes('k:"devtype"'), '개발 사업유형 선택(공동주택 분양/통매각) 존재');
ok(html.includes('k:"mcount"'), '중도금 횟수 입력 존재');
ok(html.includes('k:"dpct"') && html.includes('k:"rpct"'), '계약금·잔금 비율 입력 존재');
ok(html.includes('function simDevBulk'), '통매각·임대 간이 엔진 유지');
ok(html.includes('function devSens2'), '분양률×분양가 민감도 매트릭스 존재');
ok(html.includes('function devResiCompute'), '분양수지 순수 계산 코어(devResiCompute) 존재');
ok(html.includes('function devSolveSold'), '손익분기·PF상환한계 분양률 솔버 존재');
ok(html.includes('function devStructHtml'), '분양수지 시각화(타임라인·사업비·차트) 존재');
ok(html.includes('k:"preperiod"') && html.includes('k:"brate"'), '브릿지(선행기간·금리) 입력 존재');
ok(html.includes('k:"conscurve"') && html.includes('k:"landdp"') && html.includes('k:"landpay"'), 'v3: 기성 곡선·토지 분할 입력 존재');
ok(html.includes('window.__setDevView'), '시행↔대주 관점 토글 존재');
ok(html.includes('function devLenderHtml'), '대주 뷰(스트레스 표) 존재');
ok(html.includes('var mtLZ=') && html.includes('function decompress'), '공유 링크 압축(mtLZ) 존재');
ok(html.includes('function sharePayload') && html.includes("o.name='임차인'"), '공유 페이로드·임차인명 마스킹 존재');
ok(html.includes('id="roBanner"') && html.includes('window.__mtExitReadonly'), '읽기 전용 배너·해제 존재');
ok(html.includes('body.mt-ro'), '읽기 전용 입력 잠금 CSS 존재');
ok(html.includes("window.__mtActivate") && html.includes("track('activate')"), '퍼널: 활성화(activate) 이벤트 존재');
ok(html.includes("window.__mtComputed") && html.includes("track('computed')"), '퍼널: 결과도달(computed) 이벤트 존재');
ok(html.includes('id="obOverlay"') && html.includes("data-role=\"acq\""), '온보딩 역할 선택 모달 존재');
ok(html.includes("localStorage.getItem('mt_onboarded')"), '온보딩 첫 방문 게이트 존재');
ok(html.includes('!window.__mtOnboarding'), "온보딩·What's new 이중 노출 방지");
ok(html.includes('function renderInpProg') && html.includes('id="inpProg"'), '핵심 입력 진행률 표시 존재');
ok(html.includes('href="/guide"'), '홈→가이드 내부 링크(SEO·무확장 정식 URL) 존재');
ok(html.includes('href="/howto"'), '홈→실무 활용 가이드 링크 존재');
ok(html.includes('function dealVerdict') && html.includes('id="simVerdict"'), '결과 자동 판정 코멘트 존재');
ok(html.includes('cmp-vrow'), '딜 비교 판정 행 존재');
ok(html.includes("mini:{irrL:'이익률'") && html.includes("mini:{irrL:'추천'"), '미니 KPI 전 탭(분양·리파이) 확장');
ok(html.includes('mt_nudge') && html.includes('nudge_save'), '저장 넛지(세션 1회) 존재');
ok(html.includes('스스로 검증하는 엑셀'), "What's new v3 내용 현행화");
ok(html.includes('내 숫자가 대입된 산식') && html.includes('가정 출처, 전 딜 엑셀에'), "What's new v3 내용 4차 현행화(산식 대입·출처 엑셀)");
ok(html.includes('더 깐깐해진 점검'), "What's new v3 내용 4차 현행화(점검·경고)");
ok(html.includes('const FIELD_REF=') && html.includes('class="f-ref"'), '입력 참고 범위 칩 존재');
ok(html.includes('const FIELD_REF_DEAL=') && html.includes('function fieldRef'), '시장 참고치 v2(딜 유형별) 존재');
ok(html.includes('수도권 물류 5~7%') && html.includes('도심·강남 9~13만원'), '참고치 자산 유형별 분화(오피스≠물류)');
ok(html.includes('if(ev&&ev.isTrusted){ exTouch(el.dataset.k); if(window.__mtActivate) window.__mtActivate(); }'), '퍼널: 신뢰 입력만 활성화 + 예시 추적 해제');
ok(html.includes('function missingKeyFields') && html.includes('sim-empty'), '결과 빈 상태 안내(누락 필드) 존재');
ok(html.includes("classList.add('noresult')") && html.includes("contains('noresult')"), '빈 상태에서 다운로드 행 차단');
ok(html.includes('예시로 시작하기'), '빈 상태 → 예시 시작 버튼 존재');
ok(html.includes('[#&]t=(office|logistics|dev|refi)'), '가이드 딥링크(#t=) 존재');
ok(html.includes('[#&]view=lender'), '딥링크 대주 뷰(view=lender) 존재');
ok(html.includes('[#&][evdth]='), '딥링크 시 온보딩 스킵 가드(#h= 포함)');
ok(html.includes('ps-verdict'), 'IC 원페이저 자동 판정 라인 존재');
ok(html.includes('function termHelp') && html.includes('class="k-help"'), '결과 용어 → 가이드 앵커 링크 존재');
ok(html.includes('function mtNextTip') && html.includes('mt_tip_next'), '산출물 다음 단계 팁(1회) 존재');
ok(html.includes('function oneLineReport') && html.includes('한 줄 보고 복사'), '한 줄 보고(카톡용 요약+링크) 존재');
ok(html.includes('cmp-hi'), '딜 비교 최적값 하이라이트 존재');
ok(html.includes('function wonConv') && html.includes('class="f-conv"'), '원화 환산 라이브 힌트(억/조) 존재');
ok(html.includes('탭하면 결과로 이동'), '미니 KPI 탭 → 결과 스크롤 존재');
ok(html.includes('학습 모드 — 결과 지표 옆'), 'learn 온보딩 용어사전 안내 존재');
ok(html.includes("var deepLink=/[#&][evdth]=/.test(location.hash||'')"), "딥링크 진입 시 What's new 자동 팝업 억제");
ok(html.includes('window.__wizOpen') && html.includes('id="wizBtn"') && html.includes('wiz-sheet'), '모바일 빠른 입력 위저드 존재');
ok(html.includes("['asset','landcost','conscost','equity','pfrate']") && html.includes("['asset','noi','oldbal','oldrate','dscrmin']"), '위저드 딜별 핵심 필드 세트');
ok(html.includes("_gf=mnum('gfa')"), '임대료 기준 연면적 필수 가드(침묵 기본값 차단)');
ok(html.includes("'repay'"), '상환 방식 → 가이드 앵커 연결');
ok(html.includes('function wizInvalid'), '위저드 최소값 검증 존재');
ok(fs.existsSync(path.join(__dirname, 'modelter-funnel.js')), '계기판 조회 스크립트(로그 파싱) 존재');
ok(fs.existsSync(path.join(__dirname, 'parity', 'gen-xlsx.js')) && fs.existsSync(path.join(__dirname, 'parity', 'check.py')), '파리티 하네스(tools/parity) 존재');
ok(fs.existsSync(path.join(__dirname, 'qa', 'smoke.js')), '스모크 QA 스위트(tools/qa) 존재');
ok(fs.existsSync(path.join(__dirname, 'modelter-ae.js')), '계기판 조회 스크립트(Analytics Engine) 존재');
ok(html.includes('k:"midfree"') && html.includes('k:"midrate"'), '중도금 무이자(대납이자) 입력 존재');
ok(html.includes('k:"taxpct"') && html.includes('k:"salespct"') && html.includes('k:"hugpct"'), '사업비 세부(제세·판매비·분양보증) 입력 존재');
ok(html.includes('function devTemplate'), '분양수지 엑셀 생성기(devTemplate) 존재');
ok(html.includes('물류는 책임임대차 관행'), '물류 엑셀 다운로드(저운영비 기본값 안내) 존재');
ok(html.includes('function refiTemplate'), '리파이낸싱 비교 엑셀 생성기 존재');
ok(html.includes('function refiSchedule'), '리파이낸싱 연도 전개(refiSchedule) 존재');
ok(html.includes("'02_Term_Sheets'"), '텀시트 비교 시트 존재');
ok(html.includes('리파이낸싱 비교 엑셀 받기 완료'), '리파이낸싱 다운로드 경로 존재');
ok(!html.includes('refi:{label:"리파이낸싱", lite:true'), '리파이낸싱 간이 배지 졸업');
ok(html.includes("var isOffice=(typeof cur!=='undefined')&&(cur==='office'||cur==='logistics');"), '엑셀 다운로드 게이트: 오피스+물류');
ok(html.includes("'03_Monthly_CF'"), '분양수지 월별 CF 시트 존재');
ok(html.includes('function devResiInputs'), '엔진·엑셀 공용 입력 파서(devResiInputs) 존재');
ok(html.includes('분양수지 엑셀 받기 완료'), '분양수지 다운로드 경로 존재');
ok(!html.includes("cur==='reit'") && !html.includes('리츠 · 펀드 운용') && !html.includes('function simReit'), '리츠·펀드 운용 탭 제거 확인');

/* ── 2) 앱 로드 + 딜별 계산 (DOM 스텁 헤드리스) ── */
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = blocks.find(b => b.includes('function fillExample'));
const inj = blocks.find(b => b.includes('const XLTMPL='));
ok(!!main, 'main 스크립트 블록 발견');
ok(!!inj, 'injected 스크립트 블록 발견');

function stub() { const s = {}; const f = function () { return el; };
  const el = new Proxy(f, { get(t, p) {
    if (p === 'querySelectorAll') return () => [];
    if (p === 'querySelector' || p === 'closest') return () => null;
    if (p === 'getBoundingClientRect') return () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
    if (p === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    if (p === 'style') return s.__s || (s.__s = {});
    if (p === 'dataset') return s.__d || (s.__d = {});
    if (['addEventListener','removeEventListener','appendChild','removeChild','insertBefore','setAttribute','removeAttribute','click','focus','blur','select','remove','scrollIntoView','setSelectionRange'].includes(p)) return () => {};
    if (p === 'getAttribute') return () => null;
    if (p === 'getContext') return () => stub();
    if (['value','innerHTML','textContent','className','href','placeholder','id','name','type'].includes(p)) return (p in s) ? s[p] : '';
    if (['hidden','checked','disabled'].includes(p)) return (p in s) ? s[p] : false;
    if (p === Symbol.toPrimitive) return () => '';
    if (p in s) return s[p];
    return el;
  }, set(t, p, v) { s[p] = v; return true; }, apply() { return el; } }); return el; }

const G = globalThis;
G.window = G; G.addEventListener = () => {}; G.matchMedia = () => ({ matches: false, addEventListener() {} });
G.innerWidth = 1200; G.innerHeight = 800; G.scrollTo = () => {};
G.document = { getElementById: () => stub(), querySelector: () => null, querySelectorAll: () => [], createElement: () => stub(), addEventListener: () => {}, body: stub(), documentElement: stub(), readyState: 'complete', fonts: { ready: Promise.resolve() } };
G.location = { hash: '', origin: 'https://modelter.com', pathname: '/', href: '' };
G.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
G.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
// navigator는 Node 내장 getter → defineProperty로 교체(sendBeacon 캡처). fetch 폴백도 캡처.
try { Object.defineProperty(G, 'navigator', { configurable: true, value: { sendBeacon: (u, b) => { if (u === '/e') G.__beacon = b; return true; } } }); } catch (e) { }
G.fetch = (u, o) => { if (u === '/e' && o) G.__beacon = o.body; return Promise.resolve({ ok: true, status: 204 }); };
G.alert = () => {};
G.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} }; G.Blob = function (p) { this.parts = p; };
G.IntersectionObserver = function () { this.observe = () => {}; this.disconnect = () => {}; };

const driver = `;(function(){
  var deals = ["office","logistics","dev","refi"];
  deals.forEach(function(c){
    cur = c; window.rrModel = null;
    fillExample();
    var r = simModel();
    if (c !== "refi" && !(r && (r.kpis || r.type))) throw new Error("simModel 비정상: " + c);
    if (typeof renderForm === "function") renderForm();
    if (typeof update === "function") update();
  });
  // 렌트롤 경로
  cur = "office";
  var leases = [{area:1200,rentPP:62000,camPP:21000,deposit:120000000,yrsToExp:2,rentFreeRemain:0,stepUp:0.02}];
  var mkt = {marketPP:62000,marketCamPP:21000,newRentFree:3,absorbMonths:12,stabVac:0.05,renewP:0.7,downtime:6,mktStepUp:0.03,mtm:0,camG:0.03,repay:"만기일시(이자만)"};
  window.rrModel = {leases:leases, mkt:mkt, on:true};
  window.rrState = {agg:{count:1,leasedArea:1200,vacancy:0.857,wAvgRentPP:62000}, leases:leases};
  var RR = simModel();
  if (!(RR && RR.struct)) throw new Error("렌트롤 struct 누락");
  if (!(RR && RR.tranche)) throw new Error("렌트롤 tranche 누락");
  if (!(RR && RR.mini)) throw new Error("렌트롤 mini 누락");
  window.rrModel = null;
  // 변동 보유기간(3~10년) 무예외 + 엑셀 템플릿 생성
  cur = "office"; fillExample();
  ["3","7","10"].forEach(function(H){ state["hold"]=H; var rh=simModel(); if(!(rh&&rh.kpis)) throw new Error("보유기간 "+H+"년 계산 실패"); });
  if (typeof holdTemplate==="function"){ var t7=holdTemplate(XLTMPL,7); if(!(t7&&t7.sheets&&t7.sheets.length)) throw new Error("holdTemplate(7) 실패"); }
  state["hold"]="5";
  // 렌트롤 전용/임대면적 분리: 임대면적이 billing area, 전용면적은 netArea로 보관
  if (typeof RENTROLL !== "undefined") {
    var _g = [["임차인","전용면적(평)","임대면적(평)","월임대료","계약만기"],["t",1200,2000,124000000,"2028-02"],["u",900,1500,93000000,"2027-06"]];
    var _hr = RENTROLL.detectHeaderRow(_g), _m = RENTROLL.autoMap(_g[_hr]), _ex = RENTROLL.extractLeases(_g, _hr, _m, {});
    if (_ex.leases[0].area !== 2000) throw new Error("렌트롤 임대면적 billing 실패: " + _ex.leases[0].area);
    if (_ex.leases[0].netArea !== 1200) throw new Error("렌트롤 전용면적 netArea 실패: " + _ex.leases[0].netArea);
    var _agg = RENTROLL.aggregate(_ex.leases, 8400, 0.88);
    if (!(_agg.rentable > 7391 && _agg.rentable < 7393)) throw new Error("렌트롤 임대가능면적 산출 실패: " + _agg.rentable);
    // 따옴표 CSV(임차인명 콤마) 열 밀림 방지
    var _csvq = ["임차인,임대면적(평),월임대료", String.fromCharCode(34)+"ABC, Inc."+String.fromCharCode(34)+",2000,124000000"].join(String.fromCharCode(10));
    var _gq = RENTROLL.parseDelimited(_csvq);
    if (!(_gq[1].length === 3 && _gq[1][0] === "ABC, Inc.")) throw new Error("따옴표 CSV 파싱 실패: " + JSON.stringify(_gq[1]));
    // 행 단위 검증: 정상 렌트롤 → error 0 / 오류 렌트롤 → 코드별 검출
    var _gOK = [["임차인","임대면적(평)","월임대료","보증금","계약만기"],["t1",1000,80000000,800000000,"2028-06"],["t2",800,60000000,600000000,"2029-03"]];
    var _mOK = RENTROLL.autoMap(_gOK[0]), _eOK = RENTROLL.extractLeases(_gOK, 0, _mOK, {});
    var _wOK = RENTROLL.validateLeases(_gOK, 0, _mOK, _eOK, {rentable: 2000});
    if (_wOK.some(function(w){return w.sev === "error";})) throw new Error("정상 렌트롤에서 error 검출: " + JSON.stringify(_wOK));
    var _gBAD = [["임차인","임대면적(평)","월임대료","보증금","계약만기"],
      ["z1",0,50000000,0,"2028-06"],            // 면적 0 → 제외
      ["z2",500,-10000000,0,"2028-06"],          // 음수 임대료
      ["z3",500,0,500000000,"2027-01"],          // 보증금만 있고 임대료 없음
      ["z4",500,40000000,0,"2020-01"],           // 만기 지남
      ["z5",500,40000000,0,"만기미상"]];          // 날짜 인식 실패
    var _mB = RENTROLL.autoMap(_gBAD[0]), _eB = RENTROLL.extractLeases(_gBAD, 0, _mB, {});
    var _wB = RENTROLL.validateLeases(_gBAD, 0, _mB, _eB, {rentable: 1500});
    var _codes = _wB.map(function(w){return w.code;});
    ["RR_ZERO_AREA","RR_NEGATIVE_RENT","RR_DEPOSIT_WITHOUT_RENT","RR_EXPIRED_LEASE","RR_DATE_PARSE_FAILED","RR_AREA_SUM_EXCEEDS_NLA"].forEach(function(cd){
      if (_codes.indexOf(cd) < 0) throw new Error("렌트롤 검증 미검출: " + cd + " (got " + _codes.join(",") + ")");
    });    // 신규 검사 4종: 보증금 음수·만기<시작·합계>연면적·행 단위 임대료 스케일
    var _gN = [["임차인","임대면적(평)","월임대료","보증금","계약시작","계약만기"],
      ["n1",1000,80000000,-500000000,"2024-01","2028-06"],
      ["n2",800,60000000,0,"2029-01","2027-06"],
      ["n3",700,500,0,"2024-01","2028-06"]];
    var _mN = RENTROLL.autoMap(_gN[0]), _eN = RENTROLL.extractLeases(_gN, 0, _mN, {});
    var _wN = RENTROLL.validateLeases(_gN, 0, _mN, _eN, {rentable: 10000, gfa: 2000});
    var _cN = _wN.map(function(w){return w.code;});
    ["RR_NEGATIVE_DEPOSIT","RR_END_BEFORE_START","RR_AREA_SUM_EXCEEDS_GFA","RR_RENT_UNIT_SUSPECT"].forEach(function(cd){
      if (_cN.indexOf(cd) < 0) throw new Error("렌트롤 신규 검증 미검출: " + cd + " (got " + _cN.join(",") + ")");
    });
    if (_wN.some(function(w){return w.sev === "error";})) throw new Error("신규 렌트롤 검사가 error를 반환(경고여야 함): " + JSON.stringify(_wN));
  }
  // 임대차 리스크 지표: WALE(면적)=(100*1+300*3)/400=2.5, top1=쿠팡 300/400=0.75, 만기 스케줄
  if (typeof rrRiskMetrics === "function") {
    var _rm = rrRiskMetrics([
      {name:"소형임차", area:100, rentPP:10000, deposit:0, yrsToExp:1},
      {name:"대형임차", area:300, rentPP:10000, deposit:0, yrsToExp:3}
    ], 500);
    if (Math.abs(_rm.waleArea - 2.5) > 1e-9) throw new Error("WALE(면적) 오류: " + _rm.waleArea);
    if (Math.abs(_rm.waleRent - 2.5) > 1e-9) throw new Error("WALE(임대료) 오류: " + _rm.waleRent);
    if (Math.abs(_rm.top1 - 0.75) > 1e-9) throw new Error("top1 집중도 오류: " + _rm.top1);
    if (Math.abs(_rm.exp12 - 0.25) > 1e-9) throw new Error("12M 만기비중 오류: " + _rm.exp12);
    if (Math.abs(_rm.occupancy - 0.8) > 1e-9) throw new Error("점유율 오류: " + _rm.occupancy);
    if (!(_rm.sched[1] && _rm.sched[3])) throw new Error("만기 스케줄 누락");
  }
  // 체크 레지스트리: 커버넌트 기준 초과 설정 → breach 검출 / raw 노출 확인
  if (typeof mtChecks === "function") {
    cur = "office"; window.rrModel = null; fillExample();
    var _m5 = simModel();
    if (!(_m5 && _m5.raw && _m5.raw.INT && _m5.raw.endBal && _m5.raw.exitCap > 0)) throw new Error("simModel raw(INT/endBal/exitCap) 미노출");
    if (!(_m5.cov && _m5.cov.indexOf("커버넌트") >= 0)) throw new Error("커버넌트 표(cov) 미부착");
    state["covdscr"] = "9.9";
    var _ck = mtChecks();
    if (!_ck.some(function(c){ return c.id === "DEBT_DSCR_BREACH"; })) throw new Error("DSCR 커버넌트 breach 미검출");
    state["covdscr"] = "";
    var _ck2 = mtChecks();
    if (_ck2.some(function(c){ return c.id === "DEBT_DSCR_BREACH"; })) throw new Error("기준 해제 후에도 breach 잔존");
  }
  // 역산 솔버: 목표=현재 IRR → 매입가 ≈ 현재 매입가(±1%), 비현실 목표(80%) → 미수렴
  if (typeof solveBidPrice === "function") {
    cur = "office"; window.rrModel = null; fillExample();
    var _cur0 = simModel().raw, _p0 = parseFloat(String(state.price).replace(/,/g, ""));
    var _r1 = solveBidPrice(_cur0.IRR);
    if (!_r1.converged) throw new Error("현재 IRR 역산 미수렴");
    if (Math.abs(_r1.value - _p0) / _p0 > 0.01) throw new Error("역산 매입가 오차: " + _r1.value + " vs " + _p0);
    var _r2 = solveBidPrice(5.0);
    if (_r2.converged) throw new Error("비현실 목표(500%)에 수렴함");
    var _r3 = solveBreakEvenExitCap("em");
    if (!(_r3.converged && _r3.value > 0)) throw new Error("손익분기 Exit Cap 미수렴");
    // 검증: 그 exit cap 적용 시 EM≈1.0
    var _snx = state.exitcap; state.exitcap = String(Math.round(_r3.value * 100) / 100);
    var _em = simModel().raw.EM; state.exitcap = _snx;
    if (Math.abs(_em - 1.0) > 0.01) throw new Error("손익분기 Exit Cap 검산 실패: EM=" + _em);
    state["covdscr"] = "";
  }
  // 원페이지 티저: 생성 → zip 재해석 → 토큰 완전 치환·딜명·S&U 균형 확인
  if (typeof TEASER !== "undefined") {
    cur = "office"; window.rrModel = null; fillExample();
    var _tz = TEASER.build();
    if (!(_tz && _tz.length > 20000)) throw new Error("티저 생성 실패(bytes=" + (_tz && _tz.length) + ")");
    var _zf = XLSXREAD.readZip(_tz);
    var _sx = XLSXREAD.entryText(_zf["ppt/slides/slide1.xml"]);
    if (_sx.indexOf("⟦") >= 0) throw new Error("티저 미치환 토큰 잔존");
    var _nm = (state.asset || "").trim();
    if (_nm && _sx.indexOf(_nm) < 0) throw new Error("티저에 딜명 미포함");
    if (_sx.indexOf("Sources - Uses = 0억") < 0) throw new Error("티저 S&U 불균형: " + (_sx.match(/Sources - Uses = [^<]*/) || [""])[0]);
    if (!_zf["[Content_Types].xml"] || !_zf["ppt/presentation.xml"]) throw new Error("티저 zip 구조 손상");
  }
  // 비도관 세후 IRR 경로: 도관에선 세후 KPI 없음 / 비도관에선 세후 KPI 등장·세전과 상이
  cur = "office"; fillExample();
  var preR = simModel(); if (preR.kpis.some(function(k){return k.l.indexOf("세후")>=0;})) throw new Error("도관인데 세후 KPI가 노출됨");
  state["taxmode"] = "비도관(법인세 적용)"; state["taxrate"] = "22";
  var atR = simModel();
  var atK = atR.kpis.filter(function(k){return k.l.indexOf("세후")>=0;});
  if (atK.length !== 1) throw new Error("비도관 세후 IRR KPI 누락");
  if (atK[0].v === preR.kpis[0].v) throw new Error("비도관 세후 IRR가 세전과 동일(세금 미반영)");
  state["taxmode"] = ""; state["taxrate"] = "";
  // 딜 비교 뷰: 순수계산 래퍼가 전역을 반드시 복원 + renderCompare 무예외
  if (typeof computeForSnapshot === "function" && typeof renderCompare === "function") {
    cur = "office"; window.rrModel = null; fillExample();
    var _sOffice = {}; for (var _k1 in state) _sOffice[_k1] = state[_k1];
    cur = "logistics"; fillExample();
    var _sLogi = {}; for (var _k2 in state) _sLogi[_k2] = state[_k2];
    cur = "office"; fillExample();
    var _stBefore = state, _curBefore = cur, _depthBefore = depth;
    var _cs = computeForSnapshot({c:"logistics", d:depth, s:_sLogi, k:stackState, r:refiState, rr:null});
    if (!(_cs && _cs.kpis && _cs.kpis.length)) throw new Error("computeForSnapshot 결과 없음");
    if (cur !== _curBefore || depth !== _depthBefore || state !== _stBefore) throw new Error("computeForSnapshot 전역 미복원");
    if (!('verdict' in _cs)) throw new Error("computeForSnapshot에 verdict 누락");
    var _origLoad = loadSlots;
    loadSlots = function(){ return { "딜A":{c:"office",d:depth,s:_sOffice,k:{},r:{},rr:null}, "딜B":{c:"logistics",d:depth,s:_sLogi,k:{},r:{},rr:null} }; };
    var _stB2 = state, _curB2 = cur;
    try { renderCompare(); } finally { loadSlots = _origLoad; }
    if (cur !== _curB2 || state !== _stB2) throw new Error("renderCompare 후 전역 미복원");
  }
  // IC 원페이저 강화(KPI스트립·트랜치·히트맵): 오피스(전체)·개발(KPI만) 무예외
  if (typeof buildPrintSummary === "function") {
    cur = "office"; window.rrModel = null; fillExample(); buildPrintSummary();
    cur = "dev"; fillExample(); buildPrintSummary();
    cur = "office"; fillExample();
  }
  // 이벤트 스키마 확장: mtTrack 페이로드에 활성기능 스냅샷(feats) 포함
  if (typeof window.mtTrack === "function") {
    cur = "office"; window.rrModel = null; fillExample();
    window.mtTrack("ci_probe");
    var _pb = null; try { _pb = JSON.parse(globalThis.__beacon || "{}"); } catch (e) {}
    if (!_pb || _pb.t !== "ci_probe") throw new Error("mtTrack 비콘 미전송");
    if (!("feats" in _pb)) throw new Error("이벤트 스키마에 feats 누락");
    if (_pb.deal !== "office") throw new Error("이벤트 deal 필드 누락");
  }
  // 리파이낸싱: 다년 전개·텀시트·엑셀 생성
  if (typeof refiSchedule === "function") {
    cur = "refi"; window.rrModel = null; fillExample();
    var _rf = simModel();
    if (!(_rf && _rf.rows && _rf.rows.length === 3)) throw new Error("리파이 3안 미산출");
    if (!(_rf.rows[0].yrs.length === 3 && _rf.rows[2].yrs.length === 7)) throw new Error("연도 전개 길이 오류");
    if (!(_rf.rows[0].minDSCR > 2.4 && _rf.rows[0].minDSCR < 2.5)) throw new Error("1안 minDSCR 이상: " + _rf.rows[0].minDSCR);
    if (_rf.rows[2].pass !== false) throw new Error("3안(원리금균등 7년) DSCR 미달 판정 실패");
    if (_rf.best !== 1) throw new Error("추천 대안 오류: " + _rf.best);
    if (!(Math.abs(_rf.rows[2].balloon) < 0.5)) throw new Error("원리금균등 만기 잔액≠0");
    // 원금균등 경로
    var _svR = refiState.a1_repay; refiState.a1_repay = "원금균등";
    var _rf2 = simModel();
    if (!(_rf2.rows[0].balloon < 0.5 && _rf2.rows[0].yrs[0].prin > 0)) throw new Error("원금균등 전개 오류");
    refiState.a1_repay = _svR;
    // 엑셀 생성 → zip 재해석
    if (typeof window.__refiTemplate === "function" && typeof XLSXREAD !== "undefined") {
      var _rt = window.__refiTemplate(null);
      if (!(_rt && _rt.sheets.length === 4)) throw new Error("리파이 시트 수 오류");
      var _rb = XLSXGEN.buildXlsx(_rt, null, null);
      var _rz = XLSXREAD.readZip(_rb);
      var _rw2 = XLSXREAD.entryText(_rz["xl/workbook.xml"]);
      if (_rw2.indexOf("02_Term_Sheets") < 0 || _rw2.indexOf("03_Debt_Schedule") < 0) throw new Error("리파이 시트명 누락");
      var _rs4 = XLSXREAD.entryText(_rz["xl/worksheets/sheet4.xml"]);
      if (_rs4.indexOf("PMT") < 0) throw new Error("원리금균등 PMT 수식 누락");
    }
  }
  // 물류: 화면=엑셀 동일 엔진 경로 (다운로드 개방)
  cur = "logistics"; window.rrModel = null; fillExample();
  var _lg = simModel();
  if (!(_lg && _lg.raw && isFinite(_lg.raw.IRR) && _lg.raw.IRR > 0)) throw new Error("물류 IRR 미산출");
  if (!(_lg.caveats && _lg.caveats.join("").indexOf("같은 계산식") >= 0)) throw new Error("물류 파리티 문구 누락");
  // 개발·PF: 공동주택 분양 월별 사업수지
  if (typeof simDevResi === "function") {
    cur = "dev"; window.rrModel = null; fillExample();
    var _dr = simModel();
    if (!(_dr && _dr.kpis && _dr.kpis.length)) throw new Error("분양수지 결과 없음");
    var _rw = _dr.raw;
    if (!(_rw && isFinite(_rw.rev) && _rw.rev > 0)) throw new Error("분양수입 미산출");
    if (!(_rw.aptRev > 0 && _rw.retRev > 0)) throw new Error("아파트/상업시설 수입 분리 미산출");
    if (Math.abs(_rw.cashIn - _rw.rev) > 0.5) throw new Error("현금유입 합계≠분양수입: " + _rw.cashIn + " vs " + _rw.rev);
    if (!(_rw.loan > 0)) throw new Error("필요 PF 한도 미산출");
    if (!(_rw.interest > 0)) throw new Error("건설이자 미산출");
    if (!isFinite(_rw.margin)) throw new Error("사업이익률 미산출");
    if (!(_rw.pfEnd < 0.5)) throw new Error("예시 딜에서 PF 미상환 잔액 발생: " + _rw.pfEnd);
    if (!(_rw.IRR != null && isFinite(_rw.IRR) && _rw.IRR > 0)) throw new Error("자기자본 IRR 미산출");
    // v2: 브릿지·대납이자·판매비·분양보증·솔버
    if (!(_rw.bridge > 0)) throw new Error("브릿지 한도 미산출(선행기간 8개월 예시)");
    if (!(_rw.mnap > 0)) throw new Error("중도금 무이자 대납이자 미산출");
    if (!(_rw.sales > 0 && _rw.hug > 0)) throw new Error("판매비·분양보증 미산출");
    if (!(_rw.bep != null && _rw.bep > 0 && _rw.bep < 100)) throw new Error("손익분기 분양률 이상: " + _rw.bep);
    if (!(_rw.pfc != null && _rw.pfc > 0 && _rw.pfc <= _rw.bep + 0.01)) throw new Error("PF상환한계 분양률 이상: " + _rw.pfc);
    // 손익분기 검산: BEP 분양률에서 이익≈0
    var _Ii = devResiInputs();
    var _Rb = devResiCompute(Object.assign({}, _Ii, { soldT: _rw.bep }));
    if (Math.abs(_Rb.profit) > Math.max(50, _rw.rev * 0.0005)) throw new Error("BEP 검산 실패: profit=" + _Rb.profit);
    // 브릿지 제거 → 브릿지 한도 0 + 금융이자 감소
    var _svP = state.preperiod; state.preperiod = "0";
    var _dr5 = simModel();
    if (!(_dr5.raw.bridge === 0)) throw new Error("선행기간 0인데 브릿지 한도 잔존");
    if (!(_dr5.raw.interest < _rw.interest)) throw new Error("브릿지 제거했는데 금융이자 미감소");
    state.preperiod = _svP;
    // 무이자 해제 → 대납이자 0
    var _svF = state.midfree; state.midfree = "미반영";
    if (!(simModel().raw.mnap === 0)) throw new Error("무이자 미반영인데 대납이자 발생");
    state.midfree = _svF;
    // 시각화 HTML
    if (typeof devStructHtml === "function") {
      var _sh = simModel().struct || "";
      if (_sh.indexOf("dv-tl") < 0 || _sh.indexOf("dv-cost") < 0) throw new Error("분양수지 시각화 미생성");
    }
    if (!(_dr.table && _dr.table.rows.length >= 4)) throw new Error("분기별 현금흐름 표 미생성");
    // 납부비율 합계≠100% → 경고 + 현금유입 감소
    var _sv = state.rpct; state.rpct = "20";
    var _dr2 = simModel();
    if (!(_dr2.caveats && _dr2.caveats.join("|").indexOf("100%") >= 0)) throw new Error("납부비율 합계 경고 미표시");
    if (!(_dr2.raw.cashIn < _rw.cashIn - 0.5)) throw new Error("납부비율 90%인데 현금유입 미감소");
    state.rpct = _sv;
    // 분양률 하향 → 아파트 수입 감소 + PF 한도 증가
    var _sv2 = state.aptsold; state.aptsold = "70";
    var _dr3 = simModel();
    if (!(_dr3.raw.aptRev < _rw.aptRev)) throw new Error("분양률 70%인데 아파트 수입 미감소");
    if (!(_dr3.raw.loan > _rw.loan)) throw new Error("분양률 70%인데 필요 PF 한도 미증가");
    state.aptsold = _sv2;
    // v3: S-커브·토지분할 — 필드 비우면 v2와 동일(하위호환), S-커브는 이자 감소
    var _bkC = [state.conscurve, state.landdp, state.landpay];
    state.conscurve = ""; state.landdp = ""; state.landpay = "";
    var _flat = simModel().raw;
    state.conscurve = "S-커브(20/60/20)";
    var _sc = simModel().raw;
    if (!(_sc.interest < _flat.interest)) throw new Error("S-커브인데 금융이자 미감소");
    state.conscurve = _bkC[0]; state.landdp = _bkC[1]; state.landpay = _bkC[2];
    // 대주 관점 토글: 같은 raw, 다른 KPI 렌즈
    if (typeof window.__setDevView === "function") {
      var _spR = simModel().raw;
      window.__setDevView("lender");
      var _ld = simModel();
      if (!_ld.kpis.some(function(k){ return k.l.indexOf("LTC") >= 0; })) throw new Error("대주 뷰 LTC 미표시");
      if (!(_ld.struct && _ld.struct.indexOf("스트레스") >= 0)) throw new Error("분양률 스트레스 표 미생성");
      if (Math.abs(_ld.raw.margin - _spR.margin) > 1e-12) throw new Error("관점 전환이 계산값을 바꿈");
      window.__setDevView("sponsor");
    }
    // 분양률×분양가 민감도: 4×5, 기준 칸=본 결과, 상태 복원, 방향성
    if (typeof devSens2 === "function") {
      var _bkA = state.aptrows, _bkS = state.aptsold;
      var _sm = devSens2();
      if (!(_sm && _sm.rows.length === 4 && _sm.rows[0].length === 5)) throw new Error("민감도 매트릭스 크기 오류");
      if (state.aptrows !== _bkA || state.aptsold !== _bkS) throw new Error("민감도 계산 후 상태 미복원");
      if (Math.abs(_sm.rows[0][2] - _rw.margin / 100) > 1e-9) throw new Error("민감도 기준 칸≠본 결과: " + _sm.rows[0][2] + " vs " + _rw.margin / 100);
      if (!(_sm.rows[3][2] < _sm.rows[0][2])) throw new Error("분양률 70%가 100%보다 이익률 높음");
      if (!(_sm.rows[0][4] > _sm.rows[0][0])) throw new Error("분양가 +5%가 -5%보다 이익률 낮음");
      if (_sm.baseI !== 0 || _sm.baseJ !== 2) throw new Error("기준 칸 좌표 오류");
    }
    // 분양수지 엑셀: 6시트 생성 → zip 재해석 → 수식·구조 확인
    if (typeof window.__devTemplate === "function" && typeof XLSXREAD !== "undefined") {
      var _tpl = window.__devTemplate(null);
      if (!(_tpl && _tpl.sheets.length === 6)) throw new Error("분양수지 시트 수 오류: " + (_tpl && _tpl.sheets.length));
      var _bx = XLSXGEN.buildXlsx(_tpl, null, null);
      if (!(_bx && _bx.length > 20000)) throw new Error("분양수지 엑셀 생성 실패");
      var _zx = XLSXREAD.readZip(_bx);
      var _wb = XLSXREAD.entryText(_zx["xl/workbook.xml"]);
      if ((_wb.match(/<sheet /g) || []).length !== 7) throw new Error("workbook 시트 등록 오류(6시트+_Restore 기대)");
      if (_wb.indexOf("_Restore") < 0) throw new Error("라운드트립 _Restore 시트 누락");
      if (_wb.indexOf("03_Monthly_CF") < 0 || _wb.indexOf("02_Unit_Mix") < 0) throw new Error("분양수지 시트명 누락");
      var _s4 = XLSXREAD.entryText(_zx["xl/worksheets/sheet4.xml"]);
      if (_s4.indexOf("COUNTIF") < 0 || _s4.indexOf("SUMIF") < 0) throw new Error("월별 CF 코호트 수식 누락");
      if (_s4.indexOf(">NaN<") >= 0) throw new Error("월별 CF에 NaN 셀");
      var _s5 = XLSXREAD.entryText(_zx["xl/worksheets/sheet5.xml"]);
      if (_s5.indexOf("MAX(") < 0) throw new Error("수익성 요약 수식 누락");
    }
    // 통매각(간이) 경로 유지
    state.devtype = "통매각·임대(간이)";
    if (typeof renderForm === "function") renderForm();
    var _dr4 = simModel();
    if (!(_dr4 && _dr4.kpis && _dr4.kpis.length)) throw new Error("통매각 간이 엔진 미동작");
    state.devtype = "공동주택 분양";
    if (typeof DEALS !== "undefined" && DEALS.reit) throw new Error("DEALS에 리츠 잔존");
    cur = "office"; window.rrModel = null; fillExample();
  }
  // 딜 워크스페이스: 해시 결정성 → 저장 → dirty → v0.2 → 복원 → 재생성 래퍼 → 내보내기/가져오기 왕복
  if (typeof wsDB === "function") {
    cur = "office"; window.rrModel = null; fillExample();
    var _wdb = wsDB();
    var _sn1 = wsSnapshot();
    if (wsHash(_sn1) !== wsHash(JSON.parse(JSON.stringify(_sn1)))) throw new Error("wsHash 비결정적(깊은복사 후 불일치)");
    // 딜 생성 (prompt 없이 내부 API로)
    var _did = wsId("deal"), _nowI = new Date().toISOString();
    _wdb.deals[_did] = {id:_did, name:"CI딜", createdAt:_nowI, updatedAt:_nowI, currentVersionId:null, versions:[], outputs:[]};
    var _v1 = wsAddVersion(_wdb.deals[_did], wsSnapshot(), "CI v1", _nowI);
    WS = {dealId:_did, versionId:_v1.id, savedHash:_v1.hash};
    if (_v1.label !== "v0.1") throw new Error("버전 라벨 오류: " + _v1.label);
    if (wsDirty()) throw new Error("저장 직후 dirty=true");
    if (!(_v1.summary && _v1.summary.IRR != null && isFinite(_v1.summary.IRR))) throw new Error("버전 요약 IRR 없음(엔진 재계산 실패)");
    var _ctx0 = wsOutCtx();
    if (!(_ctx0 && _ctx0.dealName === "CI딜" && _ctx0.label === "v0.1" && _ctx0.dirty === false)) throw new Error("wsOutCtx 오류");
    // 입력 변경 → dirty
    var _p0 = state.price; state.price = "999999";
    if (!wsDirty()) throw new Error("입력 변경 후 dirty=false");
    // v0.2 저장
    var _v2 = wsAddVersion(_wdb.deals[_did], wsSnapshot(), "CI v2");
    WS.versionId = _v2.id; WS.savedHash = _v2.hash;
    if (_v2.label !== "v0.2") throw new Error("v0.2 라벨 오류: " + _v2.label);
    if (wsDirty()) throw new Error("v0.2 저장 후 dirty=true");
    // v0.1 복원 → 입력 되돌아옴 + dirty 해제
    wsApplySnapshot(JSON.parse(JSON.stringify(_v1.snap)));
    WS.versionId = _v1.id; WS.savedHash = _v1.hash;
    if (state.price !== _p0) throw new Error("버전 복원 후 price 미복원: " + state.price);
    if (wsDirty()) throw new Error("복원 후 dirty=true");
    // wsWithSnapshot: v0.2 기준 임시 적용 후 전역 복원
    var _stW = state, _curW = cur, _seenP = null;
    wsWithSnapshot(_v2.snap, function(){ _seenP = state.price; });
    if (_seenP !== "999999") throw new Error("wsWithSnapshot 스냅샷 미적용");
    if (state !== _stW || cur !== _curW) throw new Error("wsWithSnapshot 전역 미복원");
    // 산출물 이력
    wsLogOutput(_did, _v2.id, "xlsx", "test.xlsx", "version");
    if (!_wdb.deals[_did].outputs.length) throw new Error("산출물 이력 미기록");
    // 내보내기/가져오기 왕복: id 재발급 + 버전 수 유지 + 이름 충돌 처리
    var _ex = wsExportFile(_did);
    if (!(_ex && _ex.fileType === "MODELTER_DEAL_EXPORT" && _ex.schema)) throw new Error(".modelter 내보내기 형식 오류");
    var _im = wsImportFile(JSON.parse(JSON.stringify(_ex)));
    if (_im.id === _did) throw new Error("가져오기 딜 id 미재발급");
    if (_im.versions.length !== 2) throw new Error("가져오기 버전 수 불일치: " + _im.versions.length);
    if (_im.name !== "CI딜 (가져옴)") throw new Error("이름 충돌 처리 오류: " + _im.name);
    if (_im.versions[0].id === _v1.id) throw new Error("가져오기 버전 id 미재발급");
    if (_im.currentVersionId !== _im.versions[1].id) throw new Error("가져오기 currentVersionId 재매핑 오류");
    // loadSlots 어댑터: 딜명 → 현재 버전 스냅샷 (딜 비교 뷰 호환)
    var _ls = loadSlots();
    if (!(_ls["CI딜"] && _ls["CI딜"].s)) throw new Error("loadSlots 어댑터 오류");
    // 잘못된 파일 거부
    var _bad = false; try { wsImportFile({fileType:"nope"}); } catch (e) { _bad = true; }
    if (!_bad) throw new Error("잘못된 .modelter 파일이 통과됨");
    // 정리
    delete _wdb.deals[_did]; delete _wdb.deals[_im.id];
    WS = {dealId:null, versionId:null, savedHash:null};
    cur = "office"; window.rrModel = null; fillExample();
  }
  // 공유 링크: LZW 왕복 무손실 + 렌트롤 마스킹 + 읽기전용/편집 분기
  if (typeof mtLZ !== "undefined") {
    var _samples = ["", "office", JSON.stringify({c:"office",d:"standard",s:{price:"120000",asset:"강남 A타워"},k:{senior_on:true}}),
                    "가".repeat(500), JSON.stringify({rr:{leases:Array.from({length:30},function(_,i){return {name:"실명"+i,area:1200,rentPP:62000};})}})];
    _samples.forEach(function(x){ if (mtLZ.decompress(mtLZ.compress(x)) !== x) throw new Error("mtLZ 왕복 실패: len " + x.length); });
    // 페이로드에 실명 미포함(마스킹)
    cur = "office"; window.rrModel = { on:true, leases:[{name:"진짜임차인명주식회사",area:1200,rentPP:62000,camPP:0,deposit:0}], mkt:{} };
    if (typeof sharePayload === "function") {
      var _pl = sharePayload();
      if (JSON.stringify(_pl).indexOf("진짜임차인명") >= 0) throw new Error("공유 페이로드에 실명 노출");
      if (!(_pl.rr && _pl.rr.leases[0].area === 1200)) throw new Error("공유 페이로드 렌트롤 수치 누락");
      // 압축→해제→적용 왕복
      var _enc = mtLZ.compress(JSON.stringify(_pl));
      var _dec = JSON.parse(mtLZ.decompress(_enc));
      if (_dec.rr.leases[0].name.indexOf("임차인") !== 0) throw new Error("마스킹 이름 복원 실패");
    }
    window.rrModel = null;
    cur = "office"; fillExample();
  }
  globalThis.__CI_OK = 1;
})();`;

try {
  new Function(main + '\n' + inj + '\n' + driver)();
  ok(G.__CI_OK === 1, '앱 로드 + 4개 딜 계산 + 렌트롤 경로 무예외');
} catch (e) {
  fails.push('헤드리스 실행 예외: ' + (e && e.message));
}

/* ── 결과 ── */
console.log('');
if (fails.length) {
  console.error('❌ 모델터 CI 실패 (' + fails.length + '건):');
  fails.forEach(f => console.error('   - ' + f));
  process.exit(1);
}
console.log('✅ 모델터 CI 통과 — 라이브 배포 안전');
