#!/usr/bin/env node
/* 분기 시장 노트 생성 (전략 E8) — notes/YYYYqN.html
 *
 * 시의성 콘텐츠를 SEO·재방문 자산으로 축적하되, E7 데이터셋(data/market-ref.json) 갱신과
 * 한 몸으로 돌려 유지비 최소화. 수치별로 사전 입력 공유 링크(#v=…&src=notes)를 심어,
 * 검색자가 클릭 한 번(가입·데모 없이)으로 그 가정이 채워진 라이브 계산기에 착지하게 한다.
 *
 * 링크의 정확성: 앱 본체(index.html)의 mtLZ 압축기와 EXAMPLES 예시 딜을 그대로 추출해 쓰므로
 *   브라우저 디코더와 100% 호환(드리프트 없음).
 *
 * 사용:  node tools/gen-notes.js                 # market-ref.json asof 분기로 생성
 *        node tools/gen-notes.js --quarter 2026q2
 *        node tools/gen-notes.js --check          # 최신 여부 검사(CI)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'dart-search', 'web', 'modelter');
const NOTES = path.join(DIR, 'notes');
const BASE = 'https://modelter.com';
const CHECK = process.argv.includes('--check');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return (i >= 0 && process.argv[i + 1]) ? process.argv[i + 1] : d; }
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── 앱 본체에서 코덱·예시 딜 추출(단일 진실원 — 드리프트 없음) ──
function extractApp() {
  const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  const mLZ = html.match(/var mtLZ=(\(function\(\)\{[\s\S]*?return \{compress:compress, decompress:decompress\};\s*\}\)\(\));/);
  if (!mLZ) throw new Error('mtLZ 추출 실패');
  const mtLZ = new Function('return ' + mLZ[1])();
  const mEx = html.match(/const EXAMPLES=(\{[\s\S]*?\n\});/);
  if (!mEx) throw new Error('EXAMPLES 추출 실패');
  const EXAMPLES = new Function('return ' + mEx[1])();
  return { mtLZ, EXAMPLES };
}

// 범위 텍스트("참고 4.0~5.5%")에서 중앙값
function midOf(text) {
  const m = String(text).match(/(\d+(?:\.\d+)?)\s*[~∼～]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const v = (parseFloat(m[1]) + parseFloat(m[2])) / 2;
  return Math.round(v * 100) / 100;
}

function prefillLink(mtLZ, EXAMPLES, deal, override) {
  const ex = EXAMPLES[deal]; if (!ex) return '';
  const payload = { c: deal, d: 'standard', s: Object.assign({}, ex.state, override || {}), k: ex.stack || {}, r: ex.refi || {} };
  const enc = mtLZ.compress(JSON.stringify(payload));
  return BASE + '/#v=' + enc + '&src=notes';
}

function quarterMeta(mr) {
  const q = arg('quarter', '');
  if (q) { const mm = q.match(/^(\d{4})q(\d)$/i); if (mm) return { id: q.toLowerCase(), year: mm[1], n: mm[2] }; }
  const mm = String(mr.asof || '').match(/^(\d{4})\.(\d)Q$/);
  if (mm) return { id: mm[1] + 'q' + mm[2], year: mm[1], n: mm[2] };
  throw new Error('분기를 알 수 없습니다(--quarter 2026q2 또는 market-ref asof)');
}

function build() {
  const { mtLZ, EXAMPLES } = extractApp();
  const mr = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'market-ref.json'), 'utf8'));
  const q = quarterMeta(mr);
  const title = `${q.year}년 ${q.n}분기 상업용 부동산 시장 노트 — 참고치로 바로 모델 돌려보기 | 모델터`;
  const desc = `${q.year}년 ${q.n}분기 오피스·물류 Cap Rate, PF 금리 참고치와 그 가정이 채워진 라이브 재무모델. 클릭 한 번으로 IRR·DSCR을 확인하세요.`;
  const canonical = `${BASE}/notes/${q.id}.html`;

  // 참고치(딜 오버라이드 우선) 헬퍼
  const ref = (deal, k) => (mr.deal[deal] && mr.deal[deal][k]) || mr.common[k] || null;

  const cards = [];
  const officeCap = ref('office', 'exitcap'), officeMid = midOf(officeCap.text);
  if (officeMid) cards.push({ deal: 'office', label: '서울 오피스 Exit Cap', text: officeCap.text, src: officeCap.src, asof: officeCap.asof,
    override: { exitcap: String(officeMid) }, blurb: `이번 분기 서울 오피스 Exit Cap 참고 범위의 가운데값 ${officeMid}%를 강남 A타워 예시(매입가 1,200억·연면적 8,400평)에 적용했습니다. Cap을 0.5%p 올리고 내리면 IRR이 어떻게 움직이는지 민감도로 바로 보입니다.` });
  const logiCap = ref('logistics', 'exitcap'), logiMid = midOf(logiCap.text);
  if (logiMid) cards.push({ deal: 'logistics', label: '수도권 물류 Exit Cap', text: logiCap.text, src: logiCap.src, asof: logiCap.asof,
    override: { exitcap: String(logiMid) }, blurb: `수도권 물류 Cap 참고 범위 가운데값 ${logiMid}%를 이천 물류센터 예시(매입가 2,100억·3.5만평)에 적용했습니다. 저온·상온과 책임임대차 여부에 따라 실제 Cap은 달라집니다.` });
  const pf = mr.common.pfrate, pfMid = midOf(pf.text);
  if (pfMid) cards.push({ deal: 'dev', label: '분양 본PF 금리', text: pf.text, src: pf.src, asof: pf.asof,
    override: { pfrate: String(pfMid) }, blurb: `본PF 금리 참고 범위 가운데값 ${pfMid}%를 판교 A지구 분양 예시에 적용했습니다. 금리와 선행기간(브릿지)이 손익분기 분양률(BEP)을 얼마나 끌어올리는지 확인해 보세요.` });

  const cardsHtml = cards.map(c => {
    const link = prefillLink(mtLZ, EXAMPLES, c.deal, c.override);
    return `  <section class="note-card">
    <h2>${esc(c.label)}</h2>
    <p class="figure">${esc(c.text.replace(/^참고\s*/, ''))} <span class="src" title="출처: ${esc(c.src)} · ${esc(c.asof)} 기준 · 참고치이며 개별 자산별로 다릅니다">${esc(c.asof)} · ${esc(c.src)}</span></p>
    <p>${esc(c.blurb)}</p>
    <a class="cta" href="${link}">이 가정으로 지금 모델 돌려보기 →<span class="sub">예시 딜이 채워진 채 열립니다 · 숫자만 바꾸면 결과가 바로 · 가입·설치 없음</span></a>
  </section>`;
  }).join('\n');

  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: `${q.year}년 ${q.n}분기 상업용 부동산 시장 노트`, datePublished: mr.asof || '', author: { '@type': 'Person', name: '김성훈 (Seonghoon Kim)' }, publisher: { '@type': 'Organization', name: '모델터' }, description: desc, url: canonical, isAccessibleForFree: true };

  const page = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${canonical}" />
<meta name="author" content="김성훈 (Seonghoon Kim)" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${BASE}/og.png" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23a9792b'/%3E%3Cg fill='%23fbf6ec'%3E%3Crect x='8.5' y='17.5' width='3.4' height='6' rx='1.1'/%3E%3Crect x='14.3' y='14' width='3.4' height='9.5' rx='1.1'/%3E%3Crect x='20.1' y='10.5' width='3.4' height='13' rx='1.1'/%3E%3Crect x='7.5' y='24.2' width='17' height='1.7' rx='0.85'/%3E%3C/g%3E%3C/svg%3E" />
<link rel="preconnect" href="https://cdn.jsdelivr.net" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" media="print" onload="this.media='all'" />
<noscript><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" /></noscript>
<script type="application/ld+json">
${JSON.stringify(ld)}
</script>
<style>
:root{--bg:#f3f1ec;--panel:#fdfcf9;--ink:#1b2230;--ink-2:#46505f;--ink-3:#6a7280;--muted:#8b8f98;--line:#e3e0d8;--line-soft:#efece4;--accent:#a9792b;--accent-deep:#86601f;--font:'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#14171d;--panel:#1c2027;--ink:#e8eaef;--ink-2:#b6bcc7;--ink-3:#8a909b;--muted:#8b919c;--line:#2a3039;--line-soft:#20252d;--accent:#cda557;--accent-deep:#ddb86f}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);background:var(--bg);color:var(--ink);line-height:1.7;-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:0 22px}
header{border-bottom:1px solid var(--line-soft);background:var(--panel)}
header .wrap{display:flex;align-items:center;justify-content:space-between;padding:14px 22px}
.logo{display:flex;align-items:center;gap:9px;font-weight:800;font-size:17px;color:var(--ink);text-decoration:none}
.logo .m{width:26px;height:26px;border-radius:7px;background:var(--accent);display:inline-block}
.back{font-size:13.5px;color:var(--accent-deep);text-decoration:none;font-weight:600;border:1px solid var(--line);padding:7px 14px;border-radius:9px}
.crumb{font-size:12.5px;color:var(--muted);padding:16px 0 0}
.crumb a{color:var(--ink-3);text-decoration:none}
.hero{padding:10px 0 4px}
.eyebrow{font-size:12px;font-weight:700;color:var(--accent-deep);letter-spacing:.02em;text-transform:uppercase}
h1{font-size:28px;font-weight:800;line-height:1.28;margin:8px 0 8px}
.lead{font-size:16px;color:var(--ink-2)}
.note-card{padding:20px 0;border-top:1px solid var(--line-soft)}
.note-card h2{font-size:18px;font-weight:800;margin-bottom:6px}
.figure{font-size:15px;color:var(--ink);font-weight:600;margin-bottom:8px}
.figure .src{display:inline-block;font-size:11.5px;color:var(--accent-deep);font-weight:500;opacity:.85;border-bottom:1px dotted var(--line);cursor:help;margin-left:4px}
p{margin-bottom:11px;color:var(--ink-2)}
.cta{display:block;background:var(--accent);color:#fff;font-weight:700;text-decoration:none;padding:13px 18px;border-radius:12px;font-size:15px;text-align:center;margin:8px 0 0}
.cta:hover{filter:brightness(1.06)}
.cta .sub{display:block;font-size:12px;font-weight:500;opacity:.9;margin-top:3px}
.disc{font-size:12.5px;color:var(--muted);background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:13px 16px;margin:20px 0 0}
footer{border-top:1px solid var(--line);padding:24px 0 40px;color:var(--muted);font-size:12.5px;margin-top:14px}
footer a{color:var(--ink-3)}
</style>
</head>
<body>
<header><div class="wrap">
  <a class="logo" href="/"><span class="m"></span>모델터</a>
  <a class="back" href="/">← 모델 만들러</a>
</div></header>
<main class="wrap">
  <nav class="crumb"><a href="/">모델터</a> › 시장 노트 › ${esc(q.year)}년 ${esc(q.n)}분기</nav>
  <div class="hero">
    <div class="eyebrow">분기 시장 노트 · ${esc(mr.asof || '')}</div>
    <h1>${esc(q.year)}년 ${esc(q.n)}분기 참고치,<br>클릭 한 번으로 모델에 넣어 보기</h1>
    <p class="lead">이번 분기 오피스·물류 Cap Rate와 분양 PF 금리 참고치입니다. 각 수치는 그 가정이 <b>미리 채워진 라이브 재무모델</b>로 이어집니다 — 링크를 누르면 예시 딜이 그대로 열려, 숫자만 바꾸며 IRR·DSCR을 30초 만에 확인할 수 있습니다.</p>
  </div>
${cardsHtml}
  <div class="disc">${esc(mr.note || '')} 위 수치는 공개 기준·업계 관행을 정리한 <b>참고치</b>이며 특정 자산의 시세·감정평가액이 아닙니다. 개별 자산·입지·시점별로 다르며, <b>투자 권유가 아닌 정보 제공 목적</b>입니다.</div>
</main>
<footer><div class="wrap">
  모델터 — 한국 상업용 부동산 재무모델 빌더 · <a href="/">홈</a> · <a href="/guide.html">용어사전</a> · <a href="/trust.html">보안·개인정보</a> · <a href="/verification.html">파리티 검증</a><br>
  입력 가정에 따른 추정치이며 투자 권유가 아닌 정보 제공 목적입니다.
</div></footer>
</body>
</html>
`;
  return { id: q.id, html: page, cards: cards.length };
}

const r = build();
const out = path.join(NOTES, r.id + '.html');
if (CHECK) {
  const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
  if (cur !== r.html) { console.error('STALE: notes/' + r.id + '.html — `node tools/gen-notes.js` 재실행 후 커밋'); process.exit(1); }
  console.log('✓ 분기 노트 최신 (notes/' + r.id + '.html)');
  process.exit(0);
}
fs.mkdirSync(NOTES, { recursive: true });
fs.writeFileSync(out, r.html);
console.log('✅ 분기 노트 생성: notes/' + r.id + '.html (' + r.cards + '개 사전 입력 카드)');
console.log('   sitemap 갱신: node tools/gen-pages.js');
