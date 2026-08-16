#!/usr/bin/env node
/* 모델터 검색 착지 페이지 생성기 (전략 E3) — 용어 24 + 계산기 4 정적 페이지
 *
 * "빌드 없음" 원칙: 런타임 빌드가 아니라 커밋 타임 스크립트. 수동 실행 후 결과를 커밋한다.
 *   node tools/gen-pages.js          # dart-search/web/modelter/{t,calc}/*.html + sitemap 갱신
 *   node tools/gen-pages.js --check  # 생성 없이 현재 파일이 최신인지 검사(CI용, 종료코드로 신호)
 *
 * 정의는 guide.html(권위 원본)에서 추출해 중복을 만들지 않고, 각 페이지에 실무 예시·
 * 관련 계산기 CTA(#t=…&src=seo)·JSON-LD 를 덧붙인다. 앱 본체(index.html)는 건드리지 않는다.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'dart-search', 'web', 'modelter');
const CHECK = process.argv.includes('--check');
const BASE = 'https://modelter.com';

/* ── 딜(계산기) 메타 ── */
const DEALS = {
  office: { name: '오피스 매입 재무모델', short: '오피스', kw: '오피스 매입 IRR·Cap·DSCR 계산기, 13시트 엑셀',
    lede: '매입가, 임대료, 대출 조건을 넣으면 레버드 IRR, Equity Multiple, DSCR, Cap Rate를 계산합니다. 결과와 같은 수식이 들어 있는 13시트 엑셀도 내려받을 수 있습니다.',
    inputs: ['매입가·감정가', '평당 임대료·관리비', '공실률·임대면적', '선순위 LTV·금리·상환방식', 'Exit Cap·보유기간'],
    outputs: ['레버드/언레버드 IRR (세전·세후)', 'Equity Multiple·현금수익률', '최소 DSCR·ICR·Debt Yield', 'Exit Cap 민감도(5×5)'],
    terms: ['irr', 'caprate', 'dscr', 'noi', 'em'],
    ex: { title: '예시 — 강남 A타워 (앱에 미리 채워져 있는 딜)',
      in: [['연면적', '8,400 평'], ['매입가', '1,200억 (감정가 1,235억)'], ['평당 임대료 · 관리비', '62,000원 · 21,000원 /월'], ['공실률 · NOI 성장률', '5% · 연 2.0%'], ['선순위 LTV · 금리', '55% · 4.2% (만기일시)'], ['Exit Cap · 보유기간', '4.8% · 5년']],
      out: [['Levered IRR (세전)', '8.94%'], ['Equity Multiple', '1.48x'], ['Unlevered IRR', '6.58%'], ['최소 DSCR', '2.16x'], ['필요 자기자본', '545억']],
      note: '위 표는 앱의 기본 예시로 계산한 결과입니다. 우선주 30%·보통주 15% 구조와 도관과세(위탁관리리츠)를 반영했습니다.' },
    steps: [['딜 유형에서 <b>오피스 매입</b>을 고릅니다', '기본 예시로 입력 항목과 결과를 먼저 확인합니다'],
      ['<b>매입가·연면적·평당 임대료</b>를 실제 값으로 바꿉니다', '값을 바꾸면 IRR·DSCR도 다시 계산됩니다'],
      ['<b>LTV·금리·상환방식</b>으로 대출 조건을 맞춥니다', '최소 DSCR·Debt Yield가 대주 기준을 넘는지 확인합니다'],
      ['<b>Exit Cap·보유기간</b>으로 매각 가정을 잡습니다', '민감도 표(Exit Cap × 성장률)에서 하방을 함께 봅니다'],
      ['<b>엑셀 13시트</b>를 내려받습니다', '파일 안에서 값을 바꾸면 수식도 다시 계산됩니다']],
    faqs: [['오피스 매입 IRR은 어떻게 계산하나요?', '초기 자기자본 투입(−), 매년 배당 현금흐름(+), 매각 회수(+)를 시점별로 늘어놓고 순현재가치가 0이 되는 할인율을 구합니다. 모델터는 취득부대비·보증금 승계·대출 원리금·도관과세까지 반영해 레버드 IRR과 무차입 기준 언레버드 IRR을 함께 보여줍니다.'],
      ['보증금 승계는 어떻게 반영되나요?', '승계 대상 보증금은 취득자금(Sources)에 넣고 매각 시 반환합니다. 렌트롤을 올리면 실제 보증금 합계를 사용하며, 보증금 운용수익도 입력 가정에 따라 반영합니다.'],
      ['Exit Cap은 얼마로 잡아야 하나요?', '통상 진입 Cap보다 보수적으로(높게) 잡습니다. 모델터는 Exit Cap이 진입보다 낮으면 공격적 가정이라고 표시하고, Exit Cap × 성장률 5×5 민감도로 IRR이 어디까지 빠지는지 함께 보여줍니다.'],
      ['화면 숫자와 엑셀이 정말 같나요?', '네. 엑셀을 실제 수식 엔진으로 다시 계산해 화면 값과 일치하는지 매 배포마다 검증하며, 결과는 /verification 에 공개합니다.']] },
  logistics: { name: '물류센터 매입 재무모델', short: '물류', kw: '물류센터 매입 재무모델, 책임임대차·Cap 계산',
    lede: '오피스 매입 모델과 같은 구조에 물류센터의 운영비와 책임임대차 가정을 반영했습니다. 화면 결과와 같은 수식의 13시트 엑셀을 만듭니다.',
    inputs: ['매입가·연면적(평)', '평당 임대료(저층·고층 구분)', '마스터리스 여부', 'LTV·금리·상환', 'Exit Cap·보유기간'],
    outputs: ['레버드/언레버드 IRR', 'Equity Multiple·CoC', '최소 DSCR·Debt Yield', 'Cap×성장률 민감도'],
    terms: ['caprate', 'masterlease', 'vacancy', 'dscr', 'wale'],
    ex: { title: '예시 — 이천 물류센터 (앱에 미리 채워져 있는 딜)',
      in: [['연면적', '35,000 평'], ['매입가', '2,100억 (감정가 2,150억)'], ['평당 임대료 · 관리비', '33,000원 · 1,700원 /월'], ['공실률 · NOI 성장률', '5% · 연 2.5%'], ['선순위 LTV · 금리', '55% · 4.2% (만기일시)'], ['Exit Cap · 보유기간', '5.3% · 5년']],
      out: [['Levered IRR (세전)', '10.60%'], ['Equity Multiple', '1.58x'], ['Unlevered IRR', '7.38%'], ['최소 DSCR', '2.25x'], ['필요 자기자본', '924억']],
      note: '오피스와 같은 13시트 구조에 물류센터용 운영비와 관리비 기본값을 넣었습니다. 값은 가정 시트에서 바꿀 수 있습니다.' },
    steps: [['딜 유형에서 <b>물류센터 매입</b>을 고릅니다', '물류센터에 맞는 기본 가정이 들어 있습니다'],
      ['<b>연면적·평당 임대료</b>를 실제 조건으로 바꿉니다', '저층·고층 임대료가 다르면 가중평균으로 넣습니다'],
      ['<b>책임임대차(마스터리스)</b> 여부를 반영합니다', '통임차면 공실률을 낮춰 NOI 안정성을 반영합니다'],
      ['<b>LTV·Exit Cap</b>으로 금융·매각 가정을 맞춥니다', '물류는 오피스보다 Exit Cap을 높게 보는 것이 일반적입니다'],
      ['<b>엑셀 13시트</b>를 내려받습니다', '화면 수치와 같은 계산식이 들어 있습니다']],
    faqs: [['물류센터는 오피스와 무엇이 다른가요?', '수익 구조는 같은 임대형이라 동일한 레버드 DCF 엔진을 쓰지만, 운영비 비중이 낮고 관리비 단가가 작으며 책임임대차(마스터리스) 비중이 높습니다. 모델터는 이 관행을 물류 딜의 기본값으로 반영합니다.'],
      ['책임임대차(마스터리스)는 어떻게 반영하나요?', '한 임차인이 건물 전체를 통임차하고 공실 위험을 떠안는 구조이므로 공실률을 낮춰 NOI 안정성을 반영합니다. 대신 임대료 상승 여력이 제한된다는 점을 성장률 가정에 반영하는 것이 실무입니다.'],
      ['평당 임대료가 층별로 다르면?', '저층·고층 단가가 다르면 면적 가중평균으로 넣거나, 렌트롤을 붙여 임차인별 조건(만기·렌트프리·상승률)을 그대로 반영할 수 있습니다.']] },
  dev: { name: '공동주택 분양 사업수지', short: '분양', kw: '분양 사업수지 엑셀, 브릿지·본PF·중도금·손익분기 분양률',
    lede: '토지비, 공사비와 분양수입을 월별로 계산합니다. 브릿지와 본PF 금융비용, 중도금 대납이자, 손익분기 분양률, 사업이익률을 확인하고 6시트 엑셀로 내려받을 수 있습니다.',
    inputs: ['토지비·공사비(기성 곡선)', '분양가·분양률·평형 구성', '계약금·중도금·잔금 비율', '브릿지·본PF 금리·수수료', '제세·판매비·분양보증'],
    outputs: ['자기자본 IRR·사업이익률', '필요 PF 한도·건설이자', '손익분기 분양률·PF상환한계', '분양률×분양가 민감도(4×5)'],
    terms: ['bridge', 'midpay', 'bep', 'devmargin'],
    ex: { title: '예시 — 판교 A지구 공동주택 (앱에 미리 채워져 있는 딜)',
      in: [['대지 · 연면적', '9,500평 · 52,000평'], ['토지비 · 공사비', '1,800억 · 2,900억 (S-커브 20/60/20)'], ['인허가 · 공사기간', '8개월 · 32개월'], ['분양 개시 · 소진기간', '착공 3개월 후 · 18개월'], ['분양률(아파트)', '100%'], ['계약금 · 중도금', '10% · 60%(무이자 대납)']],
      out: [['사업이익률 (매출 대비)', '9%'], ['연환산 자기자본 IRR', '22.3%'], ['Equity Multiple', '1.96x'], ['분양수입 · 총사업비', '6,401억 · 5,828억'], ['사업이익', '573억'], ['손익분기 분양률', '90.7%'], ['PF 상환한계 분양률', '80.6%'], ['브릿지 · 본PF 최대 한도', '1,356억 · 1,500억']],
      note: '월별로 전개해 브릿지→본PF 차환, 중도금 대납이자, 필요 한도의 최대 인출 잔액까지 산출합니다.' },
    steps: [['딜 유형에서 <b>개발 · PF</b>를 고릅니다', '공동주택 분양 사업수지 양식이 열립니다'],
      ['<b>토지비·공사비·기간</b>을 넣습니다', '공사비는 S-커브(기성 곡선)로 월별 전개됩니다'],
      ['<b>분양가·분양률·납부 조건</b>을 설정합니다', '계약금·중도금·잔금 시점이 현금흐름과 필요 PF 한도를 좌우합니다'],
      ['<b>브릿지·본PF 금리와 수수료</b>를 넣습니다', '착공 시점에 브릿지가 본PF로 차환되는 구조로 계산됩니다'],
      ['<b>손익분기 분양률</b>을 확인합니다', '대주 보기에서는 PF 상환한계 분양률도 확인합니다'],
      ['<b>엑셀 6시트</b>를 내려받습니다', '월별 자금수지와 계산 수식이 들어 있습니다']],
    faqs: [['분양 사업수지에서 손익분기 분양률이란?', '사업이익이 0이 되는 최소 분양률입니다. 이 아래로 팔리면 적자입니다. 함께 보는 PF 상환한계 분양률은 차입을 전액 상환할 수 있는 최소 분양률로 대주의 안전선이며, 모델터는 분양률을 바꿔가며 두 값을 역산합니다.'],
      ['브릿지론과 본PF는 어떻게 이어지나요?', '토지 계약부터 착공까지는 브릿지(단기·고금리), 착공 이후 공사비는 본PF로 조달하며 착공 시점에 브릿지 잔액이 본PF로 차환됩니다. 필요 한도는 각 구간의 최대 인출 잔액으로 산정합니다.'],
      ['중도금 무이자는 어떻게 반영하나요?', '무이자 분양이면 시행사가 수분양자의 중도금 대출이자를 대납하므로 그만큼을 사업비에 반영해야 합니다. 모델터는 중도금 회차·이자율·무이자 여부를 입력받아 대납이자를 월별로 계산합니다.'],
      ['대주(PF 심사) 관점으로도 볼 수 있나요?', '네. 대주 뷰로 전환하면 LTC·분양률 스트레스·상환 안전성 중심으로 같은 딜을 다시 봅니다.']] },
  refi: { name: '리파이낸싱 비교', short: '리파이', kw: '대출 리파이낸싱 비교, DSCR·중도상환수수료·텀시트',
    lede: '현재 대출과 신규 텀시트 세 안을 비교합니다. 연도별 DSCR, 중도상환수수료와 순조달액을 계산해 4시트 엑셀로 정리합니다.',
    inputs: ['잔여 대출·금리·만기', '신규 텀시트 3안(금리·LTV·상환)', '중도상환수수료·취급수수료', '최소 DSCR 기준'],
    outputs: ['안별 연도 DSCR 전개', '순조달액·총금융비용 비교', '기준 충족안 중 최소 DSCR 비교', '만기 잔액(balloon)'],
    terms: ['ltv', 'dscr', 'repay', 'icr'],
    ex: { title: '예시 — 분당 B빌딩 차환 검토 (앱에 미리 채워져 있는 딜)',
      in: [['자산 NOI · 성장률', '42억 · 연 1.5%'], ['감정평가액', '850억'], ['기존 대출 잔액 · 금리', '460억 · 3.6%'], ['기존 만기 잔존', '0.5년'], ['중도상환수수료 · 취급수수료', '0.5% · 0.3%'], ['요구 최소 DSCR', '1.2x']],
      out: [['대안 3안별 연도별 DSCR 전개', '만기까지 연차별'], ['순조달액 (수수료 차감 후)', '안별 비교'], ['총금융비용 (이자+수수료)', '안별 비교'], ['만기 잔액 (벌룬)', '상환방식별'], ['최소 DSCR 우위', '자동 비교']],
      note: '신규 텀시트 3안(LTV·금리·만기·상환방식)을 나란히 놓고 비교합니다. 수치는 입력한 텀시트에 따라 달라집니다.' },
    steps: [['딜 유형에서 <b>리파이낸싱</b>을 고릅니다', '기존 대출과 신규 3안 비교 양식이 열립니다'],
      ['<b>자산 NOI·감정가</b>와 기존 대출 조건을 넣습니다', '잔액·금리·잔존 만기가 비교의 기준선이 됩니다'],
      ['<b>신규 텀시트 3안</b>(LTV·금리·만기·상환)을 입력합니다', '대주에게 받은 조건을 그대로 넣으면 됩니다'],
      ['<b>중도상환수수료·취급수수료</b>를 반영합니다', '순조달액과 총금융비용에 포함됩니다'],
      ['<b>연도별 DSCR</b>로 안별 안전성을 확인합니다', '요구 DSCR 미달 연차가 붉게 표시됩니다'],
      ['<b>엑셀 4시트</b>로 텀시트 비교표를 내려받습니다', '입력값과 안별 결과를 같은 파일에서 확인할 수 있습니다']],
    faqs: [['리파이낸싱은 무엇을 기준으로 비교하나요?', '순조달액, 총금융비용, 연도별 DSCR과 만기 잔액을 함께 봅니다. 모델터는 세 안을 같은 기준으로 계산하고, DSCR 기준을 충족한 안 중 전 기간 최소 DSCR가 가장 높은 안을 표시합니다.'],
      ['중도상환수수료는 어떻게 반영하나요?', '기존 대출을 조기 상환할 때 내는 비용입니다. 잔액 대비 요율로 입력하면 순조달액과 총금융비용에 포함됩니다.'],
      ['상환방식이 DSCR에 어떤 영향을 주나요?', '만기일시(이자만)는 보유 중 DSCR이 편한 대신 만기에 원금을 한 번에 갚아야 하고, 원리금균등·원금균등은 매기 부담이 커지는 대신 만기 잔액이 줄어듭니다. 모델터는 방식별 연도별 DSCR을 나란히 보여줍니다.']] },
};

/* ── 용어별 실무 메타 (deal=관련 계산기 · why=왜 중요 · ex=실무 예시) ──
 *  ⚠ 이 블록은 tools/gen-pages.js 의 TERM_META 이며, 정의 본문은 guide.html 에서 추출한다. */
const TERM_META = {
  irr: { deal: "office", why: "목표 수익률과 비교할 때 쓰는 대표 지표입니다.", ex: "강남 오피스를 5년 보유 후 매각하는 레버드 IRR이 9.2%라면, 목표 수익률 8%는 넘지만 12%에는 미치지 못합니다." },
  em: { deal: "office", why: "투입한 자기자본 대비 총 회수액을 확인해 IRR과 함께 비교합니다.", ex: "자기자본 800억을 넣어 5년 뒤 1,360억을 회수하면 EM은 1.7x입니다. IRR이 같아도 EM이 낮으면 총 회수액은 더 적습니다." },
  coc: { deal: "office", why: "매각 차익을 제외하고 보유 기간 중 배당으로 받는 현금을 보여줍니다.", ex: "자기자본 1,000억에 연 배당 현금이 65억이면 CoC는 6.5%입니다. 리츠나 펀드의 배당 재원을 볼 때 확인합니다." },
  noi: { deal: "office", why: "자산가치와 DSCR이 모두 NOI에서 출발하므로 운영비 가정이 바뀌면 두 값도 함께 달라집니다.", ex: "EGI 120억에서 인건비·수선·재산세 등 운영비 30억을 빼면 NOI는 90억입니다. 이 90억을 Cap 5%로 나누면 자산가치는 1,800억입니다." },
  caprate: { deal: "office", why: "NOI 대비 매입가와 매각가를 비교할 때 쓰는 시장 지표입니다.", ex: "진입 Cap 4.5%에 산 자산의 Exit Cap을 5.0%로 잡으면 NOI가 같아도 매각가는 약 10% 낮아지고 IRR도 내려갑니다." },
  wale: { deal: "office", why: "만기가 한 시점에 몰리면 재계약 실패 시 수입이 급감해, 대주와 투자자 모두 잔여기간을 먼저 확인합니다.", ex: "렌트롤상 WALE가 4.2년이면 매각 목표 5년 안에 대부분 재계약 협상이 걸립니다. 3년 차에 40% 면적 만기가 몰려 있으면 그 구간을 따로 스트레스합니다." },
  egi: { deal: "office", why: "만실 가정으로 수입을 부풀리지 않도록, 공실·미수를 뺀 실제 기대 수입을 확정하는 단계입니다.", ex: "만실 임대료 130억에서 공실 5% 6.5억과 미수를 빼고 주차수입 3억을 더하면 EGI는 126억 안팎입니다." },
  vacancy: { deal: "office", why: "현재 만실이어도 임차인 교체 기간에는 공실이 생길 수 있어 장기 가정에 반영합니다.", ex: "서울 도심 오피스 모델에 자연공실 4%를 넣으면 현재 점유율이 100%여도 장기 NOI는 그만큼 낮아집니다." },
  dscr: {
    deal: "refi",
    src: "dscr",
    title: "DSCR 뜻과 계산식 — 1.2x는 무슨 의미일까? | 모델터",
    desc: "DSCR = NOI ÷ 연간 원리금. 1.0x·1.2x·1.5x가 뜻하는 상환 여력과 금리·LTV·상환 방식이 DSCR을 움직이는 원리를 CRE 실무 예시로 설명합니다.",
    h1: "DSCR 뜻과 계산법",
    lead: "DSCR은 자산이 한 해 벌어들인 순영업이익으로 같은 기간의 원금과 이자를 몇 배 감당하는지 보여주는 상환 여력 지표입니다. 1.2x라면 연 원리금보다 NOI가 20% 많다는 뜻입니다.",
    why: "대주가 대출을 승인할지, 얼마까지 빌려줄지를 이 배율의 최소 요건(코버넌트)으로 정합니다. 단, 실제 산식과 요구선은 대주·자산·약정마다 다르므로 텀시트의 정의를 먼저 확인해야 합니다.",
    ex: "NOI 90억에 연 원리금이 70억이면 DSCR은 1.29x입니다. 요구선이 1.25x인 약정이라면 0.04x의 여유가 있지만, 금리 상승이나 NOI 하락을 넣어 최소 DSCR이 언제 기준 아래로 내려가는지 함께 봐야 합니다.",
    bands: [
      ["1.0x 미만", "현재 NOI만으로 연 원리금을 모두 감당하지 못합니다."],
      ["1.0x", "NOI와 원리금이 같아 공실·비용 증가를 버틸 여유가 없습니다."],
      ["1.2x", "원리금보다 NOI가 20% 많습니다. 승인선은 대주·자산·약정마다 다릅니다."],
      ["1.5x", "원리금보다 NOI가 50% 많아 상대적으로 완충 폭이 큽니다."]
    ],
    drivers: [
      ["NOI·공실", "임대수입이 줄거나 운영비가 늘면 분자인 NOI가 낮아져 DSCR이 하락합니다."],
      ["금리", "금리가 오르면 같은 대출금의 연 이자가 늘어 분모가 커지고 DSCR이 하락합니다."],
      ["대출금·LTV", "차입액이 커질수록 연 원리금 부담이 늘어 DSCR이 낮아질 수 있습니다."],
      ["상환 방식", "만기일시는 보유 중 원금 부담이 없고, 분할상환은 매기 원금이 포함돼 DSCR 경로가 달라집니다."]
    ],
    faqs: [
      ["DSCR 뜻은 무엇인가요?", "DSCR은 Debt Service Coverage Ratio의 약자로, 자산의 순영업이익이 연간 원리금 상환액의 몇 배인지를 나타내는 부채상환계수입니다."],
      ["DSCR 계산식은 무엇인가요?", "모델터는 NOI를 연간 원금과 이자의 합계로 나눕니다. 즉 DSCR = NOI ÷ 연간 원리금입니다. 약정이 NCF나 CFADS를 분자로 쓰면 해당 정의에 맞춰 다시 계산해야 합니다."],
      ["DSCR 1.2x는 무슨 뜻인가요?", "연 원리금이 100이라면 NOI가 120이라는 뜻입니다. 원리금보다 20% 많은 NOI가 있지만, 1.2x가 모든 딜의 공통 승인선이라는 뜻은 아닙니다."],
      ["DSCR과 ICR은 어떻게 다른가요?", "DSCR은 원금과 이자를 모두 분모에 넣고, ICR은 이자만 분모에 넣습니다. 원금 분할상환이 있는 대출에서는 두 지표가 달라집니다."]
    ]
  },
  icr: { deal: "refi", why: "만기일시처럼 원금을 안 갚는 구조에서는 원리금 기준 DSCR보다 이자만으로 커버되는지가 실질 안전선입니다.", ex: "NOI 90억에 연 이자 55억이면 ICR 1.64x입니다. 원금 상환이 없는 이자만 대출이라 이때는 DSCR과 ICR이 같은 값입니다." },
  ltv: { deal: "office", why: "대출 한도의 상한을 정하는 첫 제약으로, 높을수록 자기자본은 덜 들지만 대주 위험과 금리가 함께 올라갑니다.", ex: "감정가 2,000억 자산에 LTV 60%면 대출 1,200억, 자기자본 800억입니다. LTV를 55%로 낮추면 자기자본이 900억으로 늘어 IRR이 달라집니다." },
  dy: { deal: "refi", why: "금리나 상환기간과 무관하게 대출금 대비 NOI 수준을 확인하는 지표입니다.", ex: "대출 잔액 1,200억에 NOI 90억이면 Debt Yield는 7.5%입니다. 대주 기준이 8%라면 대출금을 줄여야 기준을 맞출 수 있습니다." },
  repay: { deal: "refi", why: "같은 대출도 상환방식에 따라 매기 DSCR 부담과 만기 벌룬 위험이 완전히 달라져, 대안 비교의 핵심 변수입니다.", ex: "만기일시는 보유 중 DSCR이 편한 대신 만기에 원금 1,200억을 한 번에 갚아야 하고, 원리금균등은 매기 부담이 커지는 대신 만기 잔액이 줄어듭니다." },
  deposit: { deal: "office", why: "승계 보증금은 취득자금에 잡혀 실제 필요한 자기자본을 줄여, 빼먹으면 자기자본과 IRR을 잘못 계산합니다.", ex: "월 임대료 10억인 오피스에서 10개월치 보증금 100억을 승계하면, 매입가가 같아도 넣어야 할 자기자본이 100억 줄어듭니다." },
  passthru: { deal: "office", why: "리츠·펀드는 배당요건을 채우면 법인세가 사실상 0이 되어 세전과 세후 IRR이 붙으므로, 비도관 법인과 나란히 비교하려면 구조를 맞춰야 합니다.", ex: "위탁관리리츠가 배당가능이익의 90% 이상을 배당하면 그 배당액을 소득공제받아 세후 IRR이 세전 9%와 거의 붙습니다. 일반 법인이면 법인세·감가상각을 반영해 세후가 7%대로 내려갑니다." },
  waterfall: { deal: "office", why: "우선주·보통주로 나뉜 딜에서는 같은 매각대금이라도 누가 먼저 얼마를 가져가느냐로 각 트랜치의 실제 수익률이 갈립니다.", ex: "우선주 배당 연 7% 누적을 먼저 채우고 남은 현금을 보통주가 갖는 구조라면, 매각이익이 줄 때 손실은 보통주가 먼저 흡수합니다." },
  rentfree: { deal: "office", why: "명목 임대료가 같아도 렌트프리 개월 수에 따라 실제 받는 수입이 달라져, NOI와 임대차 비교를 유효임대료로 다시 맞춰야 합니다.", ex: "명목 월 임대료 10억에 연 2개월 렌트프리면 실제 연 수입은 120억이 아니라 100억입니다. 이 유효임대료로 NOI를 잡아야 매입가가 과대평가되지 않습니다." },
  nla: { deal: "office", why: "임대료는 임대면적 기준으로 매겨져, 전용률이 낮으면 임차인이 실제 쓰는 평당 부담이 커져 재계약·신규임차 경쟁력이 떨어집니다.", ex: "임대면적 1,000평에 전용률 52%면 임차인이 실제 쓰는 전용은 520평입니다. 인근 빌딩 전용률이 58%면 같은 평당 임대료라도 우리 건물이 불리합니다." },
  noc: { deal: "office", why: "빌딩마다 렌트프리·관리비·전용률이 달라 명목 임대료로는 비교가 안 되므로, 임차인 실부담을 한 줄로 맞추는 기준이 필요합니다.", ex: "A빌딩 명목 임대료가 B보다 높아도, 렌트프리 3개월과 높은 전용률을 반영한 전용 평당 NOC로 환산하면 A가 오히려 저렴하게 나오기도 합니다." },
  masterlease: { deal: "logistics", why: "한 임차인이 건물 전체를 통임차하며 공실 위험을 떠안으면 NOI가 안정돼 대주·투자자가 선호하지만, 임대료 상승 여력은 그만큼 제한됩니다.", ex: "물류센터를 물류사가 10년 책임임대차로 통임차하면 공실률을 0에 가깝게 두고 NOI를 잡습니다. 같은 임대료라도 멀티테넌트 오피스보다 수입 변동성이 낮게 평가됩니다." },
  bridge: { deal: "dev", why: "토지 계약부터 착공까지 물려 있는 고금리 단기 자금의 기간이 초기 금융비용과 사업이익을 좌우합니다.", ex: "토지비 900억을 브릿지 금리 연 8%로 인허가까지 10개월 끌면 이자만 60억이 쌓입니다. 착공이 늦어질수록 본PF 차환 전까지 이 비용이 불어납니다." },
  midpay: { deal: "dev", why: "분양대금이 계약금·중도금·잔금으로 언제 들어오느냐가 사업 현금흐름과 필요한 본PF 한도를 결정합니다.", ex: "분양가 4,000억 사업에서 중도금 60%를 6회로 나눠 받으면, 공사비가 먼저 나가는 초기에 자금이 부족해 PF 인출 잔액이 최대치에 근접합니다." },
  bep: { deal: "dev", why: "사업이 적자로 바뀌는 분양률과 차입을 모두 상환할 수 있는 분양률을 확인합니다.", ex: "손익분기 분양률이 72%면 그 아래에서는 사업이 적자입니다. PF 상환한계 분양률이 58%라면 분양률 58%에서 차입을 모두 갚을 수 있습니다." },
  devmargin: { deal: "dev", why: "분양가 하락이나 공사비 상승을 감당할 수 있는 이익 여유를 확인합니다.", ex: "분양수입 4,000억에 총사업비 3,500억이면 사업이익은 500억, 이익률은 12.5%입니다. 총사업비가 200억 늘면 이익은 300억, 이익률은 7.5%로 내려갑니다." },
  adr: { deal: "office", why: "점유율과 함께 호텔 객실매출을 결정하는 가격 가정입니다.", ex: "300실 호텔의 연평균 ADR이 15만원이고 OCC가 75%면 객실매출은 연 약 123억입니다. ADR 가정이 5% 오르면 객실매출과 GOP도 같은 방향으로 바뀝니다." },
  occ: { deal: "office", why: "가격(ADR)을 지키면서 채울 수 있는 물량의 가정이라, 낙관적으로 잡으면 수익성 전체가 부풀려집니다.", ex: "신규 개관 호텔을 1년 차 OCC 60%, 2년 차 70%, 안정화 75%로 램프업을 깔면, 첫해 GOP가 얇아 이자 커버 여력을 따로 확인해야 합니다." },
  revpar: { deal: "office", why: "가격과 점유율을 한 숫자로 합쳐 호텔과 시장의 객실 매출 성과를 비교하는 지표입니다.", ex: "ADR 15만원×OCC 75%면 RevPAR 11.25만원입니다. 경쟁군 RevPAR가 13만원이면 가격과 점유율 중 어디에서 차이가 나는지 나눠 봅니다." },
  gop: { deal: "office", why: "호텔의 영업 성과를 보는 지표입니다. 여기에서 위탁수수료와 FF&E 적립 등을 빼야 소유주 기준 NOI가 나옵니다.", ex: "총매출 200억에 GOP 마진이 35%면 GOP는 70억입니다. 여기서 위탁수수료와 FF&E 적립 등을 빼야 NOI가 되므로 GOP만으로 가치를 계산하면 과대평가할 수 있습니다." },
  ffe: { deal: "office", why: "객실·설비는 주기 교체가 필수라, 이 적립을 빼먹으면 호텔 NOI와 자산가치가 체계적으로 부풀려집니다.", ex: "총매출 200억 호텔에 FF&E 적립 4%를 깔면 연 8억이 NOI에서 차감됩니다. Cap 5% 환원 기준으로 자산가치 160억 차이를 만드는 가정입니다." },
  hmc: { deal: "office", why: "같은 호텔이라도 위탁운영이냐 마스터리스냐에 따라 수입의 변동성과 모델 구조가 완전히 달라집니다.", ex: "위탁운영이면 기본수수료 총매출 2.5%+인센티브 GOP 9%를 빼고 영업 변동을 소유주가 안습니다. 마스터리스로 고정 임대료만 받으면 오피스처럼 임대형 모델로 검토합니다." },
  itload: { deal: "logistics", why: "데이터센터는 면적이 아니라 전력 용량이 상품이라, 규모·임대료·가치평가가 모두 kW 기준으로 움직입니다.", ex: "수전 용량 40MW 중 IT 부하 30MW를 kW당 월 3만원에 임대하면 연 매출은 약 108억입니다. 같은 연면적이라도 확보 전력이 절반이면 매출도 절반입니다." },
  pue: { deal: "logistics", why: "PUE가 높을수록 같은 IT 부하를 지원하는 데 더 많은 전력이 필요합니다. 전기료를 소유주가 부담한다면 운영비와 NOI에도 영향을 줍니다.", ex: "IT 전력 30MW에 PUE가 1.4면 시설의 총 전력은 42MW입니다. PUE를 1.3으로 낮추면 총 전력은 39MW로 줄어듭니다. 비용 효과는 전기료 부담 주체에 따라 달라집니다." }
};

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ── guide.html 에서 용어 정의 추출 (권위 원본) ── */
function extractTerms() {
  const g = fs.readFileSync(path.join(DIR, 'guide.html'), 'utf8');
  const re = /<div class="term" id="([a-z0-9]+)"><h3>([\s\S]*?)<\/h3>([\s\S]*?)<\/div>/g;
  const out = {}; let m;
  while ((m = re.exec(g))) {
    const h3 = m[2];
    const enM = h3.match(/<span class="en">([\s\S]*?)<\/span>/);
    const ko = h3.replace(/<span class="en">[\s\S]*?<\/span>/, '').trim();
    out[m[1]] = { slug: m[1], ko, en: enM ? enM[1].trim() : '', body: m[3].trim() };
  }
  return out;
}

const CSS = `:root{--bg:#f3f1ec;--panel:#fdfcf9;--ink:#1b2230;--ink-2:#46505f;--ink-3:#6a7280;--muted:#8b8f98;--line:#e3e0d8;--line-soft:#efece4;--accent:#a9792b;--accent-deep:#86601f;--green:#2e7d4f;--red:#b4552d;--font:'Pretendard Variable',Pretendard,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;--mono:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace}
@media(prefers-color-scheme:dark){:root{--bg:#14171d;--panel:#1c2027;--ink:#e8eaef;--ink-2:#b6bcc7;--ink-3:#8a909b;--muted:#8b919c;--line:#2a3039;--line-soft:#20252d;--accent:#cda557;--accent-deep:#ddb86f;--green:#57b07f;--red:#d98a5f}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);background:var(--bg);color:var(--ink);line-height:1.7;-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:0 22px}
header{border-bottom:1px solid var(--line-soft);background:var(--panel)}
header .wrap{display:flex;align-items:center;justify-content:space-between;padding:14px 22px}
.logo{display:flex;align-items:center;gap:9px;font-weight:800;font-size:17px;color:var(--ink);text-decoration:none}
.logo .m{width:26px;height:26px;border-radius:7px;background:var(--accent);display:inline-block}
.back{font-size:13.5px;color:var(--accent-deep);text-decoration:none;font-weight:600;border:1px solid var(--line);padding:7px 14px;border-radius:9px}
.back:hover{border-color:var(--accent)}
.crumb{font-size:12.5px;color:var(--muted);padding:16px 0 0}
.crumb a{color:var(--ink-3);text-decoration:none}.crumb a:hover{color:var(--accent-deep)}
.hero{padding:10px 0 4px}
.eyebrow{font-size:12px;font-weight:700;color:var(--accent-deep);letter-spacing:.02em;text-transform:uppercase}
h1{font-size:29px;font-weight:800;line-height:1.25;margin:8px 0 6px}
h1 .en{display:block;font-size:15px;font-weight:600;color:var(--muted);margin-top:4px}
.lead{font-size:16px;color:var(--ink-2);line-height:1.65;margin:10px 0}
section{padding:22px 0;border-top:1px solid var(--line-soft)}
h2{font-size:18px;font-weight:800;margin-bottom:8px}
p{margin-bottom:11px;color:var(--ink-2)}
.formula{display:inline-block;font-family:var(--mono);font-size:14px;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 13px;color:var(--accent-deep);margin:4px 0 10px}
.tip{font-size:14px;color:var(--ink-3);background:var(--panel);border-left:3px solid var(--accent);border-radius:0 9px 9px 0;padding:11px 15px;margin:8px 0}
.ex{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:15px 18px;margin:6px 0}
.ex h2{font-size:14px;color:var(--accent-deep);margin-bottom:6px}
.ex p{margin:0;color:var(--ink-2)}
.cta{display:block;background:var(--accent);color:#fff;font-weight:700;text-decoration:none;padding:14px 18px;border-radius:12px;font-size:15.5px;text-align:center;margin:16px 0 4px}
.cta:hover{filter:brightness(1.06)}
.cta .sub{display:block;font-size:12.5px;font-weight:500;opacity:.9;margin-top:3px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.chips a{font-size:13px;color:var(--ink-2);background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:6px 13px;text-decoration:none}
.chips a:hover{border-color:var(--accent);color:var(--accent-deep)}
.io{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:6px 0}
@media(max-width:560px){.io{grid-template-columns:1fr}}
.io .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.io h2{font-size:14px;margin-bottom:8px}
.io ul{list-style:none;font-size:14px;color:var(--ink-2)}
.io li{padding:3px 0 3px 16px;position:relative}
.io li::before{content:"·";position:absolute;left:3px;color:var(--accent);font-weight:700}
footer{border-top:1px solid var(--line);padding:24px 0 40px;color:var(--muted);font-size:12.5px;margin-top:8px}
footer a{color:var(--ink-3)}
/* 계산 예시 표 · 단계 · FAQ (검색 착지 심화) */
.wex{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:4px 16px 10px;margin:10px 0}
.wex table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.wex td,.wex th{padding:8px 4px;font-size:14px;border-bottom:1px solid var(--line-soft);text-align:right}
.wex td:first-child,.wex th:first-child{text-align:left;color:var(--ink-2)}
.wex th{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-weight:600}
.wex tr:last-child td{border-bottom:none}
.wex .r{font-family:var(--mono);font-weight:700;color:var(--ink)}
.wex .out .r{color:var(--accent-deep);font-size:15px}
.wex tr.out td{background:#fdf8ef}
.wex.meaning td:last-child,.wex.meaning th:last-child{text-align:left;padding-left:14px}
.steps{counter-reset:s;list-style:none;margin:8px 0}
.steps li{position:relative;padding:9px 0 9px 34px;font-size:14.5px;color:var(--ink-2);border-bottom:1px solid var(--line-soft)}
.steps li:last-child{border-bottom:none}
.steps li::before{counter-increment:s;content:counter(s);position:absolute;left:0;top:9px;width:22px;height:22px;border-radius:50%;background:var(--accent-soft,rgba(169,121,43,.12));color:var(--accent-deep);font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}
.steps b{color:var(--ink)}
.faq{border-bottom:1px solid var(--line-soft);padding:12px 0}
.faq:last-of-type{border-bottom:none}
.faq summary{font-size:15px;font-weight:700;cursor:pointer;list-style:none;color:var(--ink)}
.faq summary::-webkit-details-marker{display:none}
.faq summary::before{content:"＋";color:var(--accent);font-weight:800;margin-right:9px}
.faq[open] summary::before{content:"－"}
.faq p{font-size:14px;color:var(--ink-2);padding:9px 0 2px 23px;line-height:1.65}`;

function shell(o) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}" />
<link rel="canonical" href="${o.canonical}" />
<meta name="author" content="김성훈 (Seonghoon Kim)" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(o.title)}" />
<meta property="og:description" content="${esc(o.desc)}" />
<meta property="og:url" content="${o.canonical}" />
<meta property="og:image" content="${BASE}/og-first-deal-v1.png" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23a9792b'/%3E%3Cg fill='%23fbf6ec'%3E%3Crect x='8.5' y='17.5' width='3.4' height='6' rx='1.1'/%3E%3Crect x='14.3' y='14' width='3.4' height='9.5' rx='1.1'/%3E%3Crect x='20.1' y='10.5' width='3.4' height='13' rx='1.1'/%3E%3Crect x='7.5' y='24.2' width='17' height='1.7' rx='0.85'/%3E%3C/g%3E%3C/svg%3E" />
<link rel="preconnect" href="https://cdn.jsdelivr.net" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" media="print" onload="this.media='all'" />
<noscript><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" /></noscript>
<script type="application/ld+json">
${JSON.stringify(o.ld)}
</script>
<style>${CSS}</style>
<script>
/* 외부 검색·콘텐츠 → 정적 착지 → 계산기 이동 사이에 유입 호스트만 같은 탭에 보존한다. */
try{if(!sessionStorage.getItem('mt_ref0')&&document.referrer){var _rh=new URL(document.referrer).hostname;if(_rh&&_rh!==location.hostname)sessionStorage.setItem('mt_ref0',_rh.slice(0,40));}}catch(_e){}
</script>
</head>
<body>
<header><div class="wrap">
  <a class="logo" href="/"><span class="m"></span>모델터</a>
  <a class="back" href="${o.backHref}">${esc(o.backLabel)}</a>
</div></header>
<main class="wrap">
${o.body}
</main>
<footer><div class="wrap">
  모델터 · 한국 상업용 부동산 재무모델 · <a href="/">홈</a> · <a href="/guide">용어사전</a> · <a href="/howto">실무 가이드</a> · <a href="/im-checklist">IM 체크리스트</a> · <a href="/trust">보안·개인정보</a> · <a href="/verification">검증 결과</a><br>
  입력 가정에 따른 추정치이며 투자 권유가 아닌 정보 제공 목적입니다. 숫자 예시는 샘플이며 실제 시세가 아닙니다.
</div></footer>
</body>
</html>
`;
}

function relatedTermChips(slug, terms, meta) {
  // 같은 딜의 다른 용어 3개 + 계산기
  const deal = meta.deal;
  const sibs = Object.keys(TERM_META).filter(s => s !== slug && TERM_META[s].deal === deal).slice(0, 3);
  const extra = Object.keys(TERM_META).filter(s => s !== slug && !sibs.includes(s)).slice(0, 3 - sibs.length);
  return sibs.concat(extra);
}

function termPage(slug, terms) {
  const t = terms[slug], meta = TERM_META[slug];
  if (!t || !meta) return null;
  const deal = DEALS[meta.deal];
  const title = meta.title || `${t.ko} 뜻·계산식·실무 예시 | 모델터`;
  const desc = meta.desc || `${t.ko}(${t.en})의 정의와 계산식, 상업용 부동산 실무 예시를 정리했습니다. ${meta.why}`;
  const canonical = `${BASE}/t/${slug}`;   // Cloudflare 에셋이 .html 을 떼고 서빙(무확장이 200, .html은 307)
  const rel = relatedTermChips(slug, terms, meta);
  const chips = rel.map(s => `<a href="/t/${s}">${esc(terms[s].ko)}</a>`).join('');
  const graph = [
      { '@type': 'DefinedTerm', '@id': canonical + '#term', name: t.ko, alternateName: t.en, description: t.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300), inDefinedTermSet: `${BASE}/guide` },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: '모델터', item: BASE + '/' },
        { '@type': 'ListItem', position: 2, name: '용어사전', item: BASE + '/guide' },
        { '@type': 'ListItem', position: 3, name: t.ko, item: canonical } ] },
    ];
  if (meta.faqs) graph.push({ '@type': 'FAQPage', inLanguage: 'ko',
    mainEntity: meta.faqs.map(f => ({ '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[1] } })) });
  const ld = { '@context': 'https://schema.org', '@graph': graph };
  const src = meta.src || 'seo';
  const body = `  <nav class="crumb"><a href="/">모델터</a> › <a href="/guide">용어사전</a> › ${esc(t.ko)}</nav>
  <div class="hero">
    <div class="eyebrow">부동산 금융 용어</div>
    <h1>${esc(meta.h1 || t.ko)}<span class="en">${esc(t.en)}</span></h1>
${meta.lead ? `    <p class="lead">${esc(meta.lead)}</p>` : ''}
  </div>
  <section>
    <h2>정의</h2>
    ${t.body}
  </section>
  <section>
    <h2>왜 중요한가</h2>
    <p>${esc(meta.why)}</p>
  </section>
  <section class="ex">
    <h2>실무 예시</h2>
    <p>${esc(meta.ex)}</p>
  </section>
${meta.bands ? `  <section>
    <h2>DSCR 배수, 이렇게 읽습니다</h2>
    <div class="wex meaning"><table>
      <tr><th>DSCR</th><th>판독</th></tr>
      ${meta.bands.map(r => `<tr><td class="r">${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('\n      ')}
    </table></div>
    <p class="tip">배수가 높을수록 상환 여유는 크지만, 숫자 하나만으로 승인 여부를 단정할 수 없습니다. 약정의 분자 정의와 테스트 시점도 함께 확인하세요.</p>
  </section>` : ''}
${meta.drivers ? `  <section>
    <h2>무엇이 DSCR을 움직이나요?</h2>
    <div class="io">${meta.drivers.map(r => `<div class="card"><h2>${esc(r[0])}</h2><p>${esc(r[1])}</p></div>`).join('')}</div>
  </section>` : ''}
${meta.faqs ? `  <section>
    <h2>자주 묻는 질문</h2>
    ${meta.faqs.map(f => `<details class="faq"><summary>${esc(f[0])}</summary><p>${esc(f[1])}</p></details>`).join('\n    ')}
  </section>` : ''}
  <section>
    <a class="cta" href="/#t=${meta.deal}&src=${src}">${meta.h1 ? '내 조건으로 DSCR 확인하기' : esc(deal.short) + ' 예시 모델 열기'} →<span class="sub">기본 예시가 들어 있습니다. 값을 바꾸면 결과가 다시 계산됩니다.</span></a>
    <h2 style="margin-top:14px">관련 용어</h2>
    <div class="chips">${chips}<a href="/calc/${meta.deal}">${esc(deal.short)} 계산기</a></div>
  </section>`;
  return shell({ title, desc, canonical, ld, backHref: '/guide', backLabel: '← 용어사전', body });
}

function calcPage(deal, terms) {
  const d = DEALS[deal];
  const title = `${d.name} | CRE 계산기·엑셀 | 모델터`;
  const desc = `${d.kw}. ${d.lede}`;
  const canonical = `${BASE}/calc/${deal}`;
  const chips = d.terms.map(s => `<a href="/t/${s}">${esc(terms[s].ko)}</a>`).join('');
  const graph = [
    { '@type': 'SoftwareApplication', name: d.name + ' — 모델터', applicationCategory: 'FinanceApplication', operatingSystem: 'Web', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' }, description: d.lede, url: canonical },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: '모델터', item: BASE + '/' },
      { '@type': 'ListItem', position: 2, name: '계산기', item: BASE + '/' },
      { '@type': 'ListItem', position: 3, name: d.name, item: canonical } ] },
  ];
  const strip = s => String(s).replace(/<[^>]+>/g, '');
  if (d.steps) graph.push({ '@type': 'HowTo', name: `${d.name} 계산 순서`, description: d.lede, totalTime: 'PT5M',
    step: d.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: strip(s[0]), text: strip(s[0]) + ' — ' + strip(s[1]), url: canonical + '#step' + (i + 1) })) });
  if (d.faqs) graph.push({ '@type': 'FAQPage', inLanguage: 'ko',
    mainEntity: d.faqs.map(f => ({ '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[1] } })) });
  const ld = { '@context': 'https://schema.org', '@graph': graph };
  const body = `  <nav class="crumb"><a href="/">모델터</a> › 계산기 › ${esc(d.name)}</nav>
  <div class="hero">
    <div class="eyebrow">상업용 부동산 계산기</div>
    <h1>${esc(d.name)}</h1>
    <p class="lead">${esc(d.lede)}</p>
  </div>
  <section>
    <a class="cta" href="/#t=${deal}&src=seo">내 값으로 계산하기 →<span class="sub">기본 예시가 들어 있습니다. 첫 입력부터 바꾸면 결과가 다시 계산됩니다.</span></a>
  </section>
  <section>
    <div class="io">
      <div class="card"><h2>넣는 값</h2><ul>${d.inputs.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="card"><h2>나오는 값</h2><ul>${d.outputs.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
    </div>
  </section>
${d.ex ? `  <section>
    <h2>계산 예시</h2>
    <p class="lead" style="font-size:14.5px">${esc(d.ex.title)}</p>
    <div class="wex"><table>
      <tr><th>넣은 값</th><th></th></tr>
      ${d.ex.in.map(r => `<tr><td>${esc(r[0])}</td><td class="r">${esc(r[1])}</td></tr>`).join('\n      ')}
      <tr><th>나온 결과</th><th></th></tr>
      ${d.ex.out.map(r => `<tr class="out"><td>${esc(r[0])}</td><td class="r">${esc(r[1])}</td></tr>`).join('\n      ')}
    </table></div>
    <p class="tip">${esc(d.ex.note)}</p>
    <a class="cta" href="/#t=${deal}&src=seo">이 예시 열기 →<span class="sub">위 표의 값이 입력되어 있습니다. 내 값으로 바꾸면 결과가 다시 계산됩니다.</span></a>
  </section>
` : ''}${d.steps ? `  <section>
    <h2>${esc(d.short)} 계산 순서</h2>
    <ol class="steps">
      ${d.steps.map((s, i) => `<li id="step${i + 1}">${s[0]}<br><span style="font-size:13px;color:var(--muted)">${esc(strip(s[1]))}</span></li>`).join('\n      ')}
    </ol>
  </section>
` : ''}  <section>
    <h2>화면 = 다운로드 엑셀</h2>
    <p>화면과 엑셀은 같은 계산식을 사용합니다. 파일 안에서 값을 바꾸면 수식도 다시 계산됩니다. 딜 데이터는 서버로 전송되지 않고 브라우저 안에서 처리됩니다. <a href="/verification">검증 결과 보기 →</a></p>
  </section>
${d.faqs ? `  <section>
    <h2>자주 묻는 질문</h2>
    ${d.faqs.map(f => `<details class="faq"><summary>${esc(f[0])}</summary><p>${esc(f[1])}</p></details>`).join('\n    ')}
  </section>
` : ''}  <section>
    <h2>관련 용어</h2>
    <div class="chips">${chips}<a href="/guide">용어사전 전체</a></div>
  </section>
  <section>
    <h2>다른 딜 유형</h2>
    <div class="chips">${Object.keys(DEALS).filter(k => k !== deal).map(k => `<a href="/calc/${k}">${esc(DEALS[k].short)} 계산기</a>`).join('')}<a href="/calc/hotel">호텔 (준비중)</a></div>
  </section>`;
  return shell({ title, desc, canonical, ld, backHref: '/', backLabel: '← 모델터 홈', body });
}

/* ── 준비 중 딜 착지면 (수요 선점) ──
 *  딜 구현 전에도 검색 수요를 흡수한다. 과장 금지: '준비 중'을 명시하고, 지금 가능한 대안(마스터리스→매입 엔진)을 제시. */
const SOON = {
  hotel: { name: '호텔 재무모델', short: '호텔', vote: '호텔',
    kw: '호텔 매입 재무모델·ADR·RevPAR·GOP 계산',
    lede: '호텔 수입은 ADR과 객실 점유율에서 시작해 RevPAR, GOP, NOI 순서로 계산합니다. 전용 계산기는 준비 중이며, 현재 사용할 수 있는 방법을 아래에 적었습니다.',
    terms: ['adr', 'occ', 'revpar', 'gop', 'ffe', 'hmc', 'caprate', 'dscr'],
    chain: [['객실 매출', 'ADR × 객실 수 × 점유율(OCC) × 365 — RevPAR(=ADR×OCC)로 비교'],
      ['총매출', '객실 매출 + 부대 매출(F&B·연회 등, 객실 매출 대비 비율)'],
      ['GOP', '총매출 − 부문별 비용 − 미배분 영업비용 (USALI 기준, 총매출 대비 마진 %로 관리)'],
      ['NOI', 'GOP − 운영위탁수수료(기본+인센티브) − FF&E 적립(총매출 3~5%) − 보험·재산세'],
      ['자산가치', 'NOI ÷ Cap rate — 이후 부채·자기자본 구조는 오피스 매입과 동일']],
    now: [['마스터리스(책임임대차) 구조는 <b>지금 검토할 수 있습니다</b>',
        '운영사에 통임차를 주고 고정 임대료를 받는 구조는 오피스와 같은 임대형 모델로 볼 수 있습니다. 오피스 계산기에 임대료, 기간, 대출 조건을 넣어 IRR과 DSCR을 확인하세요.', '/calc/office'],
      ['위탁운영(HMC) 구조는 <b>준비 중입니다</b>',
        'ADR, OCC, GOP 마진, 수수료와 FF&E 적립을 직접 넣는 전용 계산기는 아직 제공하지 않습니다. 아래 버튼으로 필요한 딜 유형을 알려 주세요.', null]],
    faqs: [['호텔 재무모델은 오피스와 무엇이 다른가요?', '오피스는 계약 임대료가 수입을 확정하지만, 호텔은 매일의 영업 실적(ADR×점유율)이 수입을 만들고 인건비·운영비도 함께 변동합니다. 그래서 NOI 변동성이 훨씬 크고, GOP·운영위탁수수료·FF&E 적립이라는 호텔 고유 단계를 거쳐 NOI에 도달합니다. 부채·자기자본·매각 구조는 매입 딜과 동일합니다.'],
      ['RevPAR와 ADR은 어떻게 다른가요?', 'ADR은 실제로 팔린 객실의 평균 단가이고, RevPAR는 판매 가능한 전체 객실 기준 매출(= ADR × 점유율)입니다. 가격만 높고 점유율이 낮으면 ADR은 좋아 보여도 RevPAR가 깎이므로, 호텔 간 성과 비교는 RevPAR로 합니다.'],
      ['FF&E 적립을 왜 꼭 빼야 하나요?', '객실 가구·비품·설비는 주기적으로 교체해야 하는 필수 지출입니다. 통상 총매출의 3~5%를 매년 적립하며, 이를 빼지 않으면 NOI와 자산가치가 체계적으로 과대평가됩니다. 대주와 투자자 모두 선택이 아닌 필수 차감으로 봅니다.'],
      ['호텔 딜은 언제 추가되나요?', '준비 중 딜의 수요 투표가 기준을 넘으면 구현 여부를 검토합니다. 현재 호텔 전용 계산기는 제공하지 않습니다.']] },
};
function soonPage(key, terms) {
  const d = SOON[key];
  const title = `${d.name} — ADR·RevPAR·GOP 계산 구조 | 모델터`;
  const desc = `${d.kw}. ${d.lede}`.slice(0, 155);
  const canonical = `${BASE}/calc/${key}`;
  const chips = d.terms.filter(s => terms[s]).map(s => `<a href="/t/${s}">${esc(terms[s].ko)}</a>`).join('');
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: '모델터', item: BASE + '/' },
      { '@type': 'ListItem', position: 2, name: '계산기', item: BASE + '/' },
      { '@type': 'ListItem', position: 3, name: d.name, item: canonical } ] },
    { '@type': 'FAQPage', inLanguage: 'ko', mainEntity: d.faqs.map(f => ({ '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[1] } })) },
  ] };
  const body = `  <nav class="crumb"><a href="/">모델터</a> › 계산기 › ${esc(d.name)}</nav>
  <div class="hero">
    <div class="eyebrow">운영형 자산 · 딜 유형 준비 중</div>
    <h1>${esc(d.name)}</h1>
    <p class="lead">${esc(d.lede)}</p>
  </div>
  <section>
    <h2>ADR에서 NOI까지 계산 순서</h2>
    <div class="wex"><table>
      <tr><th>단계</th><th>산출 방식</th></tr>
      ${d.chain.map(r => `<tr><td><b>${esc(r[0])}</b></td><td style="text-align:left;color:var(--ink-2);font-size:13.5px">${esc(r[1])}</td></tr>`).join('\n      ')}
    </table></div>
    <p class="tip">임대형 자산의 <b>NOI = EGI − OPEX</b> 자리에 호텔은 <b>GOP − 수수료 − FF&amp;E 적립</b>이 들어갑니다. 그 뒤 Cap rate 환원·부채·자기자본·매각 구조는 오피스 매입과 동일합니다.</p>
  </section>
  <section>
    <h2>지금 검토하는 방법</h2>
    ${d.now.map(r => `<div class="ex"><h2>${r[0]}</h2><p>${r[1]}</p>${r[2] ? `<p class="try" style="margin-top:8px"><a href="${r[2]}">${esc(d.short === '호텔' ? '오피스 매입 계산기로 열기' : '열기')} →</a></p>` : ''}</div>`).join('\n    ')}
    <a class="cta" href="/#src=seo">${esc(d.vote)} 계산기 필요하다고 알리기 →<span class="sub">&lsquo;${esc(d.vote)} · 준비중&rsquo; 탭을 누르면 딜 유형만 익명으로 집계됩니다.</span></a>
  </section>
  <section>
    <h2>자주 묻는 질문</h2>
    ${d.faqs.map(f => `<details class="faq"><summary>${esc(f[0])}</summary><p>${esc(f[1])}</p></details>`).join('\n    ')}
  </section>
  <section>
    <h2>관련 용어</h2>
    <div class="chips">${chips}<a href="/guide">용어사전 전체</a></div>
  </section>
  <section>
    <h2>지금 쓸 수 있는 딜 유형</h2>
    <div class="chips">${Object.keys(DEALS).map(k => `<a href="/calc/${k}">${esc(DEALS[k].short)} 계산기</a>`).join('')}</div>
  </section>`;
  return shell({ title, desc, canonical, ld, backHref: '/', backLabel: '← 모델터 홈', body });
}

/* ── sitemap 갱신 ── */
function buildSitemap(slugs, deals) {
  // lastmod — 배포 스탬프 날짜(data/build.json). 크롤러가 최신 변경을 우선 크롤하도록.
  let lastmod = '';
  try { const bj = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'build.json'), 'utf8')); if (/^\d{4}-\d{2}-\d{2}$/.test(bj.date || '')) lastmod = bj.date; } catch (e) {}
  const urls = [
    { loc: BASE + '/', freq: 'weekly', pri: '1.0' },
    { loc: BASE + '/guide', freq: 'monthly', pri: '0.8' },
    { loc: BASE + '/howto', freq: 'monthly', pri: '0.8' },
    { loc: BASE + '/im-checklist', freq: 'monthly', pri: '0.8' },
    { loc: BASE + '/trust', freq: 'monthly', pri: '0.6' },
    { loc: BASE + '/verification', freq: 'monthly', pri: '0.6' },
  ];
  deals.forEach(d => urls.push({ loc: `${BASE}/calc/${d}`, freq: 'monthly', pri: '0.7' }));
  Object.keys(SOON).forEach(k => urls.push({ loc: `${BASE}/calc/${k}`, freq: 'monthly', pri: '0.6' }));
  slugs.forEach(s => urls.push({ loc: `${BASE}/t/${s}`, freq: 'monthly', pri: '0.6' }));
  // 분기 시장 노트(E8) — notes/*.html 자동 등록
  try {
    const nd = path.join(DIR, 'notes');
    if (fs.existsSync(nd)) fs.readdirSync(nd).filter(f => f.endsWith('.html')).sort().forEach(f => urls.push({ loc: `${BASE}/notes/${f.replace(/\.html$/, '')}`, freq: 'yearly', pri: '0.5' }));
  } catch (e) {}
  const lm = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : '';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u => `  <url>\n    <loc>${u.loc}</loc>${lm}\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.pri}</priority>\n  </url>`).join('\n') +
    '\n</urlset>\n';
}

/* ── 실행 ── */
function main() {
  const terms = extractTerms();
  const slugs = Object.keys(TERM_META);
  const deals = Object.keys(DEALS);
  // 정의 원본에 있는 용어와 META 키가 일치하는지 확인
  const missing = slugs.filter(s => !terms[s]);
  if (missing.length) { console.error('guide.html에 없는 용어: ' + missing.join(',')); process.exit(1); }

  const files = [];
  slugs.forEach(s => files.push(['t/' + s + '.html', termPage(s, terms)]));
  deals.forEach(d => files.push(['calc/' + d + '.html', calcPage(d, terms)]));
  Object.keys(SOON).forEach(k => files.push(['calc/' + k + '.html', soonPage(k, terms)]));
  files.push(['sitemap.xml', buildSitemap(slugs, deals)]);

  if (CHECK) {
    let stale = 0;
    for (const [rel, content] of files) {
      const fp = path.join(DIR, rel);
      const cur = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : null;
      if (cur !== content) { console.error('STALE: ' + rel); stale++; }
    }
    if (stale) { console.error('\n' + stale + '개 파일이 최신이 아닙니다 — `node tools/gen-pages.js` 실행 후 커밋하세요.'); process.exit(1); }
    console.log('✓ 생성 페이지 최신 (' + files.length + '개)');
    return;
  }

  fs.mkdirSync(path.join(DIR, 't'), { recursive: true });
  fs.mkdirSync(path.join(DIR, 'calc'), { recursive: true });
  for (const [rel, content] of files) fs.writeFileSync(path.join(DIR, rel), content);
  console.log('✅ 생성 완료: 용어 ' + slugs.length + ' + 계산기 ' + deals.length + ' + sitemap = ' + files.length + '개');
  console.log('   t/*.html · calc/*.html · sitemap.xml (dart-search/web/modelter/)');
}

main();
