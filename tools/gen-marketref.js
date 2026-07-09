#!/usr/bin/env node
/* 시장 참고치 인라인 생성 (전략 E7) — data/market-ref.json → index.html FIELD_REF 블록.
 *
 * 무네트워크 원칙: 런타임 fetch 가 아니라 커밋 타임에 데이터셋을 코드로 인라인한다.
 * 참고치를 무기명 하드코딩에서 출처·기준일 있는 데이터셋 유래로 격상(신뢰 자산).
 *
 * 사용:  node tools/gen-marketref.js          # index.html(배포+캐노니컬) FIELD_REF 블록 재생성
 *        node tools/gen-marketref.js --check  # 인라인된 블록이 데이터셋과 일치하는지 검사(CI)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JSON_PATH = path.join(ROOT, 'data', 'market-ref.json');
const DEPLOY = path.join(ROOT, 'dart-search', 'web', 'modelter', 'index.html');
const CANON = path.join('/home', 'user', 'modelter', 'index.html');
const CHECK = process.argv.includes('--check');
const START = '/*__MKTREF_START__*/';
const END = '/*__MKTREF_END__*/';

const jsStr = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const jsKey = k => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : jsStr(k);

function genBlock() {
  const d = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const L = [];
  L.push(START + ' /* data/market-ref.json 에서 tools/gen-marketref.js 로 생성 — 손대지 말고 JSON 을 고치세요 */');
  L.push('const MARKET_REF_ASOF=' + jsStr(d.asof || '') + ', MARKET_REF_NOTE=' + jsStr(d.note || '') + ';');
  // FIELD_REF (공통 텍스트 — refRange 파싱 호환) + FIELD_REF_META (출처·기준일)
  const common = d.common || {};
  L.push('const FIELD_REF={');
  L.push(Object.keys(common).map(k => '  ' + jsKey(k) + ':' + jsStr(common[k].text)).join(',\n'));
  L.push('};');
  L.push('const FIELD_REF_META={');
  L.push(Object.keys(common).map(k => '  ' + jsKey(k) + ':{s:' + jsStr(common[k].src || '') + ',d:' + jsStr(common[k].asof || d.asof || '') + '}').join(',\n'));
  L.push('};');
  // 딜별 오버라이드
  const deal = d.deal || {};
  L.push('const FIELD_REF_DEAL={');
  L.push(Object.keys(deal).map(dk => '  ' + jsKey(dk) + ':{' + Object.keys(deal[dk]).map(k => jsKey(k) + ':' + jsStr(deal[dk][k].text)).join(', ') + '}').join(',\n'));
  L.push('};');
  L.push('const FIELD_REF_DEAL_META={');
  L.push(Object.keys(deal).map(dk => '  ' + jsKey(dk) + ':{' + Object.keys(deal[dk]).map(k => jsKey(k) + ':{s:' + jsStr(deal[dk][k].src || '') + ',d:' + jsStr(deal[dk][k].asof || d.asof || '') + '}').join(', ') + '}').join(',\n'));
  L.push('};');
  L.push(END);
  return L.join('\n');
}

function replaceBlock(html, block) {
  const i = html.indexOf(START), j = html.indexOf(END);
  if (i < 0 || j < 0) return null;
  return html.slice(0, i) + block + html.slice(j + END.length);
}

// 기준일 신선도 — 6개월(2분기) 초과면 갱신 리마인더(하드 게이트 아님)
function staleAsofs() {
  const d = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const now = new Date();
  const curQ = now.getUTCFullYear() * 4 + Math.floor(now.getUTCMonth() / 3);   // 절대 분기 인덱스
  const stale = new Set();
  const scan = (m) => Object.keys(m).forEach(k => {
    const a = String((m[k].asof) || d.asof || '');
    const mm = a.match(/^(\d{4})\.(\d)Q$/);
    if (mm) { const q = (+mm[1]) * 4 + (+mm[2] - 1); if (curQ - q > 2) stale.add(a); }
  });
  scan(d.common || {});
  Object.values(d.deal || {}).forEach(scan);
  return [...stale];
}

const block = genBlock();

if (CHECK) {
  const html = fs.readFileSync(DEPLOY, 'utf8');
  const i = html.indexOf(START), j = html.indexOf(END);
  if (i < 0 || j < 0) { console.error('MKTREF 마커 없음 — index.html에 블록이 없습니다'); process.exit(1); }
  const cur = html.slice(i, j + END.length);
  if (cur.trim() !== block.trim()) { console.error('✗ 참고치 인라인이 data/market-ref.json 과 불일치 — `node tools/gen-marketref.js` 재실행 후 커밋'); process.exit(1); }
  console.log('✓ 참고치 인라인 최신 (data/market-ref.json)');
  process.exit(0);
}

let done = 0;
for (const fp of [DEPLOY, CANON].filter(fs.existsSync)) {
  const html = fs.readFileSync(fp, 'utf8');
  const out = replaceBlock(html, block);
  if (out === null) { console.error('마커 없음(스킵): ' + fp); continue; }
  fs.writeFileSync(fp, out); done++;
  console.log('인라인: ' + path.relative(ROOT, fp === CANON ? fp : fp));
}
if (!done) console.error('경고: 마커가 있는 index.html을 찾지 못했습니다. 먼저 FIELD_REF 블록을 마커로 감싸세요.');
const stale = staleAsofs();
if (stale.length) console.log('⚠ 기준일 6개월 초과(갱신 검토): ' + stale.join(', '));
console.log('✅ 참고치 인라인 완료 (' + done + '개 파일)');
