#!/usr/bin/env node
/* 배포 뒤 검색 표면 실검사 — GET만 사용하며 JS를 실행하지 않아 /e 이벤트를 만들지 않는다. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const localSitemap = path.join(repoRoot, 'dart-search', 'web', 'modelter', 'sitemap.xml');
const origin = new URL(process.argv[2] || 'https://modelter.com').origin;
const expectedOrigin = 'https://modelter.com';
const timeoutMs = 15000;

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function locs(xml) { return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]); }
function canonical(html) {
  const m = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)
    || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  return m ? m[1] : '';
}
function hasNoindex(html) {
  return /<meta[^>]+(?:name=["']robots["'][^>]+content=["'][^"']*noindex|content=["'][^"']*noindex[^>]+name=["']robots["'])/i.test(html);
}
async function get(url) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
  return { response, text: await response.text() };
}

assert(origin === expectedOrigin, `프로덕션 origin만 검사합니다: ${expectedOrigin}`);
assert(fs.existsSync(localSitemap), '로컬 sitemap.xml이 없습니다');

const expectedUrls = locs(fs.readFileSync(localSitemap, 'utf8'));
assert(expectedUrls.length > 0, '로컬 sitemap.xml URL이 비었습니다');
assert(new Set(expectedUrls).size === expectedUrls.length, '로컬 sitemap.xml URL이 중복됐습니다');

const liveSitemap = await get(origin + '/sitemap.xml');
assert(liveSitemap.response.status === 200, `라이브 sitemap.xml HTTP ${liveSitemap.response.status}`);
assert(/(?:application|text)\/xml/i.test(liveSitemap.response.headers.get('content-type') || ''), '라이브 sitemap.xml Content-Type이 XML이 아닙니다');
const liveUrls = locs(liveSitemap.text);
assert(JSON.stringify(liveUrls) === JSON.stringify(expectedUrls), `라이브 sitemap.xml이 로컬과 다릅니다 (${liveUrls.length}/${expectedUrls.length})`);

const robots = await get(origin + '/robots.txt');
assert(robots.response.status === 200, `라이브 robots.txt HTTP ${robots.response.status}`);
assert(robots.text.includes('Sitemap: https://modelter.com/sitemap.xml'), 'robots.txt의 정식 Sitemap 행이 없습니다');

const results = [];
for (let i = 0; i < liveUrls.length; i += 8) {
  results.push(...await Promise.all(liveUrls.slice(i, i + 8).map(async url => {
    try {
      const { response, text } = await get(url);
      const type = response.headers.get('content-type') || '';
      const problems = [];
      if (response.status !== 200) problems.push(`HTTP ${response.status}`);
      if (response.headers.get('location')) problems.push(`redirect ${response.headers.get('location')}`);
      if (!/text\/html/i.test(type)) problems.push(`Content-Type ${type || '없음'}`);
      const canon = canonical(text);
      if (canon !== url) problems.push(`canonical ${canon || '없음'}`);
      if (hasNoindex(text) || /\bnoindex\b/i.test(response.headers.get('x-robots-tag') || '')) problems.push('noindex');
      return { url, problems };
    } catch (error) {
      return { url, problems: [error.name === 'TimeoutError' ? `timeout ${timeoutMs}ms` : error.message] };
    }
  })));
}

const failures = results.filter(r => r.problems.length);
if (failures.length) {
  failures.forEach(r => console.error(`FAIL ${r.url} — ${r.problems.join(', ')}`));
  process.exit(1);
}

console.log(`LIVE SEARCH OK — sitemap·robots + canonical ${results.length}개, redirect·noindex 0`);
