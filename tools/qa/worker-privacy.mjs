#!/usr/bin/env node
/* worker.js /e 유한 토큰 실행 검사 — 임의 문자열·숫자가 로그/AE에 남지 않는지 실제 fetch로 확인 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.resolve(here, '..', '..', 'worker.js');
const source = fs.readFileSync(workerPath, 'utf8');
const mod = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const worker = mod.default;

let checks = 0;
function assert(cond, msg) { if (!cond) throw new Error(msg); checks++; }

async function send(payload) {
  const logs = [], points = [];
  const oldLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  try {
    const response = await worker.fetch({
      url: 'https://modelter.com/e',
      method: 'POST',
      json: async () => payload,
      headers: new Headers({ 'user-agent': 'Mozilla/5.0', referer: 'https://modelter.com/' }),
      cf: { country: 'KR' },
    }, { AE: { writeDataPoint: p => points.push(p) } });
    assert(response.status === 204, '응답은 항상 204여야 함');
  } finally { console.log = oldLog; }
  return { logs, points, rec: logs.length ? JSON.parse(logs[0]) : null };
}

const valid = await send({
  t: 'sens_axis', deal: 'refi', depth: 'deep', rr: true,
  feats: 'scen,rr,dep,rr,evil120000,bido', axis: 'dev_cost', src: 'dscr', act: true,
});
assert(valid.logs.length === 1 && valid.points.length === 1, '정상 이벤트 1건 기록');
assert(valid.rec.ev === 'sens_axis' && valid.rec.deal === 'refi' && valid.rec.depth === 'deep', '정상 enum 보존');
assert(valid.rec.feats === 'rr,dep,bido,scen' && valid.rec.featN === 4, '기능 플래그 정화·중복 제거·정해진 순서');
assert(valid.rec.axis === 'dev_cost' && valid.rec.src === 'dscr' && valid.rec.act === 1, '축·채널·실사용 정상 보존');

const unknownEvent = await send({ t: '매입가120000', deal: 'office', feats: 'rr' });
assert(unknownEvent.logs.length === 0 && unknownEvent.points.length === 0, '미등록 이벤트 전체 폐기');

const dirtyDims = await send({
  t: 'session', deal: '강남120000', depth: '120000', feats: 'tenantA,120000', axis: '4.2', src: '120000',
});
assert(dirtyDims.logs.length === 1 && dirtyDims.points.length === 1, '등록 이벤트는 기록');
assert(dirtyDims.rec.deal === '' && dirtyDims.rec.depth === '' && dirtyDims.rec.feats === '' && dirtyDims.rec.featN === 0 && dirtyDims.rec.axis === '' && dirtyDims.rec.src === '', '임의 차원값 전부 폐기');

const wrongDepth = await send({ t: 'depth_change', depth: 'full' });
assert(wrongDepth.rec && wrongDepth.rec.depth === '', '화면에 없는 깊이 별칭 폐기');

const probe = await send({ t: 'ci_probe_live' });
assert(probe.rec && probe.rec.ev === 'ci_probe_live', '명시적 운영 점검 이벤트 허용');

// 생성·불러오기 여부만 수집한다. 앱이 실수로 상세 정보를 붙여도 로그와 AE에는 남지 않아야 한다.
const processEvents = ['xlsx_ready', 'xlsx_error', 'wizard_open', 'wizard_finish', 'ws_restore'];
const sensitive = {
  assetName: '비공개검증빌딩', tenantName: '비공개임차인', fileName: '비공개검증빌딩.xlsx',
  price: 987654321, noi: 123456789, email: 'private-test@example.invalid',
  error: '비공개생성오류원문', message: '비공개상세오류원문', stack: '비공개스택원문',
  url: 'https://modelter.com/#e=PRIVATE_RESTORE_CONTENT',
  values: { lease: '비공개임대차내용', amount: 876543210 },
  tenants: [{ name: '비공개렌트롤임차인' }],
};
const sentinels = [
  sensitive.assetName, sensitive.tenantName, sensitive.fileName, String(sensitive.price),
  String(sensitive.noi), sensitive.email, sensitive.error, sensitive.message, sensitive.stack,
  sensitive.url, sensitive.values.lease, String(sensitive.values.amount), sensitive.tenants[0].name,
];
const recordKeys = ['msg', 'ev', 'deal', 'depth', 'rr', 'feats', 'featN', 'axis', 'dev', 'ref', 'cc', 'src', 'bot', 'act'].sort();
for (const event of processEvents) {
  const result = await send({
    ...sensitive, t: event, deal: 'office', depth: 'quick', rr: false,
    feats: '', axis: '', src: 'seo', act: true,
  });
  assert(result.logs.length === 1 && result.points.length === 1, `${event}: 정상 이벤트 1건`);
  assert(result.rec.ev === event && result.points[0].indexes[0] === event && result.points[0].blobs[0] === event, `${event}: 로그·AE 이벤트명 일치`);
  assert(JSON.stringify(Object.keys(result.rec).sort()) === JSON.stringify(recordKeys), `${event}: 로그 필드 추가 없음`);
  assert(result.points[0].blobs.length === 11 && result.points[0].doubles.length === 2, `${event}: AE 필드 추가 없음`);
  assert(JSON.stringify(Object.keys(result.points[0]).sort()) === JSON.stringify(['blobs', 'doubles', 'indexes']), `${event}: AE 저장 구조 제한`);
  const saved = JSON.stringify({ logs: result.logs, points: result.points });
  for (const marker of sentinels) assert(!saved.includes(marker), `${event}: 민감한 추가 속성 미저장`);
}

// 성공처럼 보이는 이름이나 아직 도입하지 않은 이어보기 기록도 허용하지 않는다.
for (const event of ['xlsx_ready_private', 'xlsx_error_raw', 'ws_restore_failed', 'wizard_finish_987654', 'resume_copy']) {
  const result = await send({ ...sensitive, t: event, deal: 'office' });
  assert(result.logs.length === 0 && result.points.length === 0, `${event}: 미등록 이벤트 폐기`);
}
const noResumeChannel = await send({ t: 'session', src: 'resume' });
assert(noResumeChannel.rec.src === '' && noResumeChannel.points[0].blobs[8] === '', '이번 범위 밖 resume 채널은 허용하지 않음');

console.log(`WORKER PRIVACY OK — ${checks} checks; 신규 5개 이벤트·유한 토큰·민감한 추가 속성 비저장`);
