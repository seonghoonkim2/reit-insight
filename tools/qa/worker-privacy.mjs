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

function assert(cond, msg) { if (!cond) throw new Error(msg); }

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

console.log('WORKER PRIVACY OK — 이벤트·딜·깊이·기능·축·채널 유한 토큰');
