#!/usr/bin/env node
/* 빌드 스탬프 (전략 E6) — "빌드 없음" 원칙과 충돌하지 않는 커밋 타임 치환.
 *
 * 재현성: 감사·리스크 점검에서 "이 숫자를 만든 빌드"를 특정하려면 산출물에 빌드 식별자가 찍혀야 한다.
 * 런타임 빌드가 아니라, 커밋 직전에 이 스크립트로 index.html 의 MT_BUILD 플레이스홀더를
 *   date·콘텐츠해시 로 치환한다(누구나 배포된 파일에서 재계산해 검증 가능).
 *
 * 사용 (모든 편집·cp 를 끝낸 뒤 마지막 단계):
 *   node tools/stamp-build.js          # 배포본(+세션 캐노니컬) 스탬프 + data/build.json 기록
 *   node tools/stamp-build.js --check  # 현재 스탬프가 콘텐츠와 일치하는지 검사(CI용)
 *
 * 스탬프 = <YYYY-MM-DD>·<sha10>  where sha10 = sha256(index.html 에서 MT_BUILD 값을 비운 것)[0:10]
 *   → date 는 메타데이터, sha 는 코드 지문. 배포 파일만 있으면 재계산·대조 가능.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const DEPLOY = path.join(__dirname, '..', 'dart-search', 'web', 'modelter', 'index.html');
const CANON = path.join('/home', 'user', 'modelter', 'index.html');   // 세션 캐노니컬(있으면 함께 스탬프)
const BUILD_JSON = path.join(__dirname, '..', 'data', 'build.json');
const CHECK = process.argv.includes('--check');

const RE = /(window\.MT_BUILD=')([^']*)(';)/;

function hashOf(html) {
  // MT_BUILD 값을 비운 상태의 콘텐츠 해시 (스탬프 값과 무관하게 안정)
  const blanked = html.replace(RE, "$1$3");
  return crypto.createHash('sha256').update(blanked, 'utf8').digest('hex').slice(0, 10);
}
function stampOf(html) { const m = html.match(RE); return m ? m[2] : null; }

function seoulDate(now) {
  // 모델터의 운영·판독 기준은 KST. UTC 자정 기준이면 한국 00:00~08:59에 전날로 찍힌다.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now || new Date());
}

function gitShort() {
  try { return cp.execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim(); }
  catch (e) { return ''; }
}

if (CHECK) {
  if (!fs.existsSync(DEPLOY)) { console.error('index.html 없음'); process.exit(1); }
  const html = fs.readFileSync(DEPLOY, 'utf8');
  const cur = stampOf(html);
  if (cur === null) { console.error('MT_BUILD 플레이스홀더 없음'); process.exit(1); }
  if (cur === 'DEV' || cur === '') { console.log('ℹ 미스탬프(DEV) — 릴리스 전 `node tools/stamp-build.js` 실행'); process.exit(0); }
  const want = hashOf(html);
  const got = cur.split('·')[1] || '';
  if (got !== want) { console.error('✗ 스탬프 불일치: 파일=' + got + ' 재계산=' + want + ' — 스탬프 후 파일이 변경됨. 재스탬프 필요.'); process.exit(1); }
  console.log('✓ 빌드 스탬프 일치: ' + cur);
  process.exit(0);
}

const date = seoulDate();
const targets = [DEPLOY, CANON].filter(fs.existsSync);
let shipStamp = '';
for (const fp of targets) {
  let html = fs.readFileSync(fp, 'utf8');
  if (!RE.test(html)) { console.error('스킵(플레이스홀더 없음): ' + fp); continue; }
  const sha = hashOf(html);
  const stamp = date + '·' + sha;
  html = html.replace(RE, "$1" + stamp + "$3");
  fs.writeFileSync(fp, html);
  if (fp === DEPLOY) shipStamp = stamp;
  console.log('스탬프: ' + stamp + '  → ' + path.relative(path.join(__dirname, '..'), fp));
}
// build.json (verification 페이지·사람 참조용)
try {
  fs.mkdirSync(path.dirname(BUILD_JSON), { recursive: true });
  fs.writeFileSync(BUILD_JSON, JSON.stringify({ build: shipStamp, date, sha: (shipStamp.split('·')[1] || ''), git: gitShort(), stampedAt: new Date().toISOString() }, null, 1) + '\n');
  console.log('기록: data/build.json');
} catch (e) { console.error('build.json 기록 실패: ' + e.message); }
console.log('\n다음: node tools/gen-verification.js (파리티 공표 갱신) → CI → 커밋');
