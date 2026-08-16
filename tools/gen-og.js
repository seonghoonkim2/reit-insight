#!/usr/bin/env node
/**
 * 모델터 소셜 미리보기 생성기.
 * 편집 원본(tools/og-first-deal.svg)을 1200×630 PNG로 렌더합니다.
 *
 *   NODE_PATH=<playwright node_modules> node tools/gen-og.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const source = path.join(__dirname, 'og-first-deal.svg');
const output = path.join(ROOT, 'dart-search', 'web', 'modelter', 'og-first-deal-v1.png');

async function main() {
  if (!fs.existsSync(source)) throw new Error(`원본 없음: ${source}`);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(source).href, { waitUntil: 'load' });
    await page.screenshot({ path: output, type: 'png', fullPage: false });
  } finally {
    await browser.close();
  }
  const bytes = fs.readFileSync(output);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== 1200 || height !== 630) throw new Error(`크기 오류: ${width}×${height}`);
  console.log(`OG 생성: ${path.relative(ROOT, output)} · ${width}×${height}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
