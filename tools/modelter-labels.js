'use strict';
/* 모델터 계기판 공용 라벨·상수 — modelter-ae.js 와 modelter-report.js 가 함께 require 해
 * 산출물 목록·딜/기능/기기 한글 라벨의 "단일 진실"을 공유한다(양쪽 중복 정의 시 조용한 드리프트 방지).
 *
 * 새 이벤트/딜/기능을 앱에 추가하면 여기 한 곳만 고치면 계기판(누적 총계 + 분해)이 함께 맞는다.
 */

// 산출물(output) 이벤트 — 활성화 퍼널의 마지막 단계 집계 대상
const OUTPUT_EVENTS = ['xlsx_download', 'teaser', 'ic_ppt', 'share_link', 'memo_copy', 'png_card', 'pipeline_copy', 'inquiry_copy', 'slot_save', 'prompt_copy', 'pdf_export', 'sample_download'];

// 딜 유형(blob2) — office|logistics|dev|refi 4종 + 데이터에 남아있는 reit
const DEAL_LABEL = { office: '오피스', logistics: '물류', dev: '개발·PF', refi: '리파이낸싱', reit: '리츠' };

// 활성 기능(blob7, 쉼표결합)
const FEAT_LABEL = { rr: '렌트롤', dep: '보증금승계', fee: '운용보수', bido: '비도관과세', vac: '공실', resi: '분양수지', hold: '보유기간변경', pref: '우선주', scen: '시나리오' };

// 이벤트명 한글 라벨 — 산출물 종류 카드에서 OUTPUT_EVENTS 전부를 덮어야 함
const EV_LABEL = {
  session: '방문', activate: '직접입력', computed: '결과도달',
  xlsx_download: '엑셀', ic_ppt: 'IC PPT', teaser: '티저', share_link: '공유링크',
  memo_copy: '검토메모', png_card: '요약카드', pipeline_copy: '파이프라인', inquiry_copy: '질의서',
  slot_save: '보관함저장', prompt_copy: 'AI프롬프트', pdf_export: 'PDF', sample_download: '샘플다운로드',
  qr_open: 'QR', im_quick: 'IM자동인식', im_open: 'IM-AI', house_set: '하우스기준', coach_ok: '코치마크',
};

// 기기(blob4)
const DEVICE_LABEL = { desktop: '데스크톱', mobile: '모바일', tablet: '태블릿' };

module.exports = { OUTPUT_EVENTS, DEAL_LABEL, FEAT_LABEL, EV_LABEL, DEVICE_LABEL };
