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
    lede: '매입가·임대료·대출 조건을 넣으면 레버드 IRR·Equity Multiple·DSCR·Cap Rate를 화면에서 바로 보여주고, 수식이 살아있는 13시트 엑셀을 그 자리에서 만듭니다.',
    inputs: ['매입가·감정가', '평당 임대료·관리비', '공실률·임대면적', '선순위 LTV·금리·상환방식', 'Exit Cap·보유기간'],
    outputs: ['레버드/언레버드 IRR (세전·세후)', 'Equity Multiple·현금수익률', '최소 DSCR·ICR·Debt Yield', 'Exit Cap 민감도(5×5)'],
    terms: ['irr', 'caprate', 'dscr', 'noi', 'em'] },
  logistics: { name: '물류센터 매입 재무모델', short: '물류', kw: '물류센터 매입 재무모델, 책임임대차·Cap 계산',
    lede: '수도권 물류센터 매입을 오피스와 같은 13시트 엔진으로 검토합니다. 저운영비·책임임대차(마스터리스) 관행을 기본값으로 반영하고 화면=엑셀 파리티를 지킵니다.',
    inputs: ['매입가·연면적(평)', '평당 임대료(저층·고층 구분)', '마스터리스 여부', 'LTV·금리·상환', 'Exit Cap·보유기간'],
    outputs: ['레버드/언레버드 IRR', 'Equity Multiple·CoC', '최소 DSCR·Debt Yield', 'Cap×성장률 민감도'],
    terms: ['caprate', 'masterlease', 'vacancy', 'dscr', 'wale'] },
  dev: { name: '공동주택 분양 사업수지', short: '분양', kw: '분양 사업수지 엑셀, 브릿지·본PF·중도금·손익분기 분양률',
    lede: '토지비·공사비·분양수입을 월별로 전개해 브릿지→본PF 금융비용, 중도금 대납이자, 손익분기 분양률(BEP), 사업이익률을 계산하고 6시트 엑셀로 내려받습니다.',
    inputs: ['토지비·공사비(기성 곡선)', '분양가·분양률·평형 구성', '계약금·중도금·잔금 비율', '브릿지·본PF 금리·수수료', '제세·판매비·분양보증'],
    outputs: ['자기자본 IRR·사업이익률', '필요 PF 한도·건설이자', '손익분기 분양률·PF상환한계', '분양률×분양가 민감도(4×5)'],
    terms: ['bridge', 'midpay', 'bep', 'devmargin'] },
  refi: { name: '리파이낸싱 비교', short: '리파이', kw: '대출 리파이낸싱 비교, DSCR·중도상환수수료·텀시트',
    lede: '현재 대출과 신규 텀시트 3안을 나란히 놓고, 연도별 DSCR·중도상환수수료·순조달액을 비교해 어느 안이 유리한지 판정하고 4시트 엑셀로 정리합니다.',
    inputs: ['잔여 대출·금리·만기', '신규 텀시트 3안(금리·LTV·상환)', '중도상환수수료·취급수수료', '최소 DSCR 기준'],
    outputs: ['안별 연도 DSCR 전개', '순조달액·총금융비용 비교', '추천 대안 자동 판정', '만기 잔액(balloon)'],
    terms: ['ltv', 'dscr', 'repay', 'icr'] },
};

/* ── 용어별 실무 메타 (deal=관련 계산기 · why=왜 중요 · ex=실무 예시) ──
 *  ⚠ 이 블록은 tools/gen-pages.js 의 TERM_META 이며, 정의 본문은 guide.html 에서 추출한다. */
const TERM_META = {
  irr: { deal: "office", why: "자기자본을 넣는 투자자가 이 딜을 할지 말지, 목표 수익률(허들)과 맞대는 첫 숫자입니다.", ex: "강남 오피스를 5년 보유 후 매각하는 레버드 IRR이 9.2%로 나왔다면, 허들 8%인 리츠는 통과, 12%를 요구하는 에쿼티 펀드는 탈락으로 봅니다." },
  em: { deal: "office", why: "IRR이 짧은 보유로 부풀려진 것인지, 회수 총액이 실제로 충분한지를 이 배수로 걸러냅니다.", ex: "자기자본 800억을 넣어 5년 뒤 1,360억을 회수하면 EM은 1.7x입니다. IRR 11%라도 EM이 1.3x에 그치면 보유가 짧아 총이익은 얇다는 신호로 읽습니다." },
  coc: { deal: "office", why: "매각 차익을 빼고 매년 배당으로 실제 쥐는 현금이 얼마인지가 리츠 배당 재원을 좌우합니다.", ex: "자기자본 1,000억에 연 배당 현금이 65억이면 CoC 6.5%입니다. 매각 전까지 이 수준이 유지돼야 배당수익률 방어가 됩니다." },
  noi: { deal: "office", why: "자산가치 환원과 DSCR이 모두 이 값에서 출발해, 운영비 가정 하나가 밸류에이션 전체를 흔듭니다.", ex: "EGI 120억에서 인건비·수선·재산세 등 운영비 30억을 빼면 NOI 90억입니다. 이 90억을 Cap 5%로 나누면 매각가 1,800억이 됩니다." },
  caprate: { deal: "office", why: "매입가가 비싼지 싼지, 몇 년 뒤 얼마에 팔릴지를 한 숫자로 압축하는 시장 기준입니다.", ex: "진입 Cap 4.5%에 산 자산을 Exit Cap 5.0%로 잡으면 NOI가 그대로여도 매각가는 10% 낮아져 IRR이 눈에 띄게 깎입니다." },
  wale: { deal: "office", why: "만기가 한 시점에 몰리면 재계약 실패 시 수입이 급감해, 대주와 투자자 모두 잔여기간을 먼저 확인합니다.", ex: "렌트롤상 WALE가 4.2년이면 매각 목표 5년 안에 대부분 재계약 협상이 걸립니다. 3년 차에 40% 면적 만기가 몰려 있으면 그 구간을 따로 스트레스합니다." },
  egi: { deal: "office", why: "만실 가정으로 수입을 부풀리지 않도록, 공실·미수를 뺀 실제 기대 수입을 확정하는 단계입니다.", ex: "만실 임대료 130억에서 공실 5% 6.5억과 미수를 빼고 주차수입 3억을 더하면 EGI는 126억 안팎입니다." },
  vacancy: { deal: "office", why: "지금 만실이어도 임차인 교체 공백은 반드시 생겨, 모델을 보수적으로 세우려면 최소 공실을 깔아야 합니다.", ex: "서울 도심 오피스 매입 모델에 자연공실 4%를 기본으로 넣으면, 현재 100% 임대여도 NOI가 4%가량 낮게 잡혀 매입가 협상 여력이 생깁니다." },
  dscr: { deal: "refi", why: "대주가 대출을 승인할지, 얼마까지 빌려줄지를 이 배율의 최소 요건(코버넌트)으로 정합니다.", ex: "NOI 90억에 연 원리금이 70억이면 DSCR 1.29x입니다. 대주 요구선이 1.25x면 통과하지만, 금리가 1%p 오르면 1.2x 밑으로 내려가 여유가 얼마나 되는지 함께 봅니다." },
  icr: { deal: "refi", why: "만기일시처럼 원금을 안 갚는 구조에서는 원리금 기준 DSCR보다 이자만으로 커버되는지가 실질 안전선입니다.", ex: "NOI 90억에 연 이자 55억이면 ICR 1.64x입니다. 원금 상환이 없는 이자만 대출이라 이때는 DSCR과 ICR이 같은 값입니다." },
  ltv: { deal: "office", why: "대출 한도의 상한을 정하는 첫 제약으로, 높을수록 자기자본은 덜 들지만 대주 위험과 금리가 함께 올라갑니다.", ex: "감정가 2,000억 자산에 LTV 60%면 대출 1,200억, 자기자본 800억입니다. LTV를 55%로 낮추면 자기자본이 900억으로 늘어 IRR이 달라집니다." },
  dy: { deal: "refi", why: "금리나 상환기간으로 좋아 보이게 만든 DSCR 착시를 걷어내고, 대출 자체의 맨몸 안전마진을 보는 대주 지표입니다.", ex: "대출 잔액 1,200억에 NOI 90억이면 Debt Yield 7.5%입니다. 대주 내부 기준이 8%면 대출을 1,125억으로 줄이자는 역제안이 들어옵니다." },
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
  bep: { deal: "dev", why: "분양이 부진할 때 어느 선까지 팔려야 적자를 면하는지, 어느 선이 대출을 갚는 마지노선인지를 미리 알아야 리스크가 잡힙니다.", ex: "손익분기 분양률이 72%면 그 아래로는 사업이 적자입니다. 차입을 전부 갚는 PF 상환한계 분양률이 58%라면, 대주는 58%만 팔려도 원리금은 회수한다고 봅니다." },
  devmargin: { deal: "dev", why: "분양가 하락이나 공사비 상승 같은 악재를 흡수할 완충이 있는지를 이 마진 폭으로 판단합니다.", ex: "분양수입 4,000억에 총사업비 3,500억이면 사업이익 500억, 이익률 12.5%입니다. 공사비가 5% 오르면 175억이 마진을 깎아 8% 밑으로 내려갑니다." },
  adr: { deal: "office", why: "호텔 수입의 가격 축으로, 점유율과 곱해져 객실매출 전체를 결정하는 첫 가정입니다.", ex: "300실 호텔의 연평균 ADR이 15만원이고 OCC가 75%면 객실매출은 연 약 123억입니다. ADR을 5% 올려 잡으면 그만큼 매출·GOP가 통째로 움직입니다." },
  occ: { deal: "office", why: "가격(ADR)을 지키면서 채울 수 있는 물량의 가정이라, 낙관적으로 잡으면 수익성 전체가 부풀려집니다.", ex: "신규 개관 호텔을 1년 차 OCC 60%, 2년 차 70%, 안정화 75%로 램프업을 깔면, 첫해 GOP가 얇아 이자 커버 여력을 따로 확인해야 합니다." },
  revpar: { deal: "office", why: "가격과 점유율을 한 숫자로 합쳐, 경쟁 호텔·시장 대비 성과를 공정하게 비교하는 표준 지표입니다.", ex: "ADR 15만원×OCC 75%면 RevPAR 11.25만원입니다. 경쟁군 RevPAR가 13만원이면 가격이나 점유율 어느 쪽에 격차가 있는지 분해해 봅니다." },
  gop: { deal: "office", why: "임대형 자산의 NOI에 해당하는 호텔 운영 성과의 출발점으로, 여기서 수수료·적립을 빼야 투자자가 보는 NOI가 나옵니다.", ex: "총매출 200억에 GOP 마진 35%면 GOP 70억입니다. 위탁수수료·FF&E 적립 등을 빼면 NOI는 50억 안팎으로 내려와, GOP만 보고 가치를 매기면 과대평가가 됩니다." },
  ffe: { deal: "office", why: "객실·설비는 주기 교체가 필수라, 이 적립을 빼먹으면 호텔 NOI와 자산가치가 체계적으로 부풀려집니다.", ex: "총매출 200억 호텔에 FF&E 적립 4%를 깔면 연 8억이 NOI에서 차감됩니다. Cap 5% 환원 기준으로 자산가치 160억 차이를 만드는 가정입니다." },
  hmc: { deal: "office", why: "같은 호텔이라도 위탁운영이냐 마스터리스냐에 따라 수입의 변동성과 모델 구조가 완전히 달라집니다.", ex: "위탁운영이면 기본수수료 총매출 2.5%+인센티브 GOP 9%를 빼고 영업 변동을 소유주가 안습니다. 마스터리스로 고정 임대료만 받으면 오피스처럼 임대형 모델로 검토합니다." },
  itload: { deal: "logistics", why: "데이터센터는 면적이 아니라 전력 용량이 상품이라, 규모·임대료·가치평가가 모두 kW 기준으로 움직입니다.", ex: "수전 용량 40MW 중 IT 부하 30MW를 kW당 월 3만원에 임대하면 연 매출은 약 108억입니다. 같은 연면적이라도 확보 전력이 절반이면 매출도 절반입니다." },
  pue: { deal: "logistics", why: "전력비가 운영비의 대부분이라, PUE가 높으면 같은 매출에서도 NOI 마진이 구조적으로 얇아집니다.", ex: "IT 전력 30MW에 PUE 1.4면 총 전력은 42MW로, 부대 전력 12MW분의 전기요금이 운영비에 얹힙니다. PUE를 1.3으로 낮추면 그 차액이 그대로 NOI로 돌아옵니다." }
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
footer a{color:var(--ink-3)}`;

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
<meta property="og:image" content="${BASE}/og.png" />
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23a9792b'/%3E%3Cg fill='%23fbf6ec'%3E%3Crect x='8.5' y='17.5' width='3.4' height='6' rx='1.1'/%3E%3Crect x='14.3' y='14' width='3.4' height='9.5' rx='1.1'/%3E%3Crect x='20.1' y='10.5' width='3.4' height='13' rx='1.1'/%3E%3Crect x='7.5' y='24.2' width='17' height='1.7' rx='0.85'/%3E%3C/g%3E%3C/svg%3E" />
<link rel="preconnect" href="https://cdn.jsdelivr.net" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" media="print" onload="this.media='all'" />
<noscript><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" /></noscript>
<script type="application/ld+json">
${JSON.stringify(o.ld)}
</script>
<style>${CSS}</style>
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
  모델터 — 한국 상업용 부동산 재무모델 빌더 · <a href="/">홈</a> · <a href="/guide">용어사전</a> · <a href="/howto">실무 가이드</a> · <a href="/trust">보안·개인정보</a> · <a href="/verification">파리티 검증</a><br>
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
  const title = `${t.ko} 뜻·계산식·실무 예시 | 모델터`;
  const desc = `${t.ko}(${t.en})의 정의와 계산식, 상업용 부동산 실무 예시. ${meta.why} 모델터에서 ${deal.short} 딜로 바로 계산해 보세요.`;
  const canonical = `${BASE}/t/${slug}`;   // Cloudflare 에셋이 .html 을 떼고 서빙(무확장이 200, .html은 307)
  const rel = relatedTermChips(slug, terms, meta);
  const chips = rel.map(s => `<a href="/t/${s}">${esc(terms[s].ko)}</a>`).join('');
  const ld = {
    '@context': 'https://schema.org', '@graph': [
      { '@type': 'DefinedTerm', '@id': canonical + '#term', name: t.ko, alternateName: t.en, description: t.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300), inDefinedTermSet: `${BASE}/guide` },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: '모델터', item: BASE + '/' },
        { '@type': 'ListItem', position: 2, name: '용어사전', item: BASE + '/guide' },
        { '@type': 'ListItem', position: 3, name: t.ko, item: canonical } ] },
    ]
  };
  const body = `  <nav class="crumb"><a href="/">모델터</a> › <a href="/guide">용어사전</a> › ${esc(t.ko)}</nav>
  <div class="hero">
    <div class="eyebrow">부동산 금융 용어</div>
    <h1>${esc(t.ko)}<span class="en">${esc(t.en)}</span></h1>
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
  <section>
    <a class="cta" href="/#t=${meta.deal}&src=seo">${esc(deal.short)} 딜로 ${esc(t.ko)} 바로 계산하기 →<span class="sub">숫자만 넣으면 화면에서 바로 · 수식 살아있는 엑셀까지 · 설치·가입 없음</span></a>
    <h2 style="margin-top:14px">관련 용어</h2>
    <div class="chips">${chips}<a href="/calc/${meta.deal}">${esc(deal.short)} 계산기</a></div>
  </section>`;
  return shell({ title, desc, canonical, ld, backHref: '/guide', backLabel: '← 용어사전', body });
}

function calcPage(deal, terms) {
  const d = DEALS[deal];
  const title = `${d.name} — 온라인 계산기·엑셀 | 모델터`;
  const desc = `${d.kw}. ${d.lede}`;
  const canonical = `${BASE}/calc/${deal}`;
  const chips = d.terms.map(s => `<a href="/t/${s}">${esc(terms[s].ko)}</a>`).join('');
  const ld = {
    '@context': 'https://schema.org', '@graph': [
      { '@type': 'SoftwareApplication', name: d.name + ' — 모델터', applicationCategory: 'FinanceApplication', operatingSystem: 'Web', offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' }, description: d.lede, url: canonical },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: '모델터', item: BASE + '/' },
        { '@type': 'ListItem', position: 2, name: '계산기', item: BASE + '/' },
        { '@type': 'ListItem', position: 3, name: d.name, item: canonical } ] },
    ]
  };
  const body = `  <nav class="crumb"><a href="/">모델터</a> › 계산기 › ${esc(d.name)}</nav>
  <div class="hero">
    <div class="eyebrow">온라인 재무모델 계산기</div>
    <h1>${esc(d.name)}</h1>
    <p class="lead">${esc(d.lede)}</p>
  </div>
  <section>
    <a class="cta" href="/#t=${deal}&src=seo">${esc(d.short)} 계산기 바로 열기 →<span class="sub">예시 딜이 미리 채워져 있어 숫자만 바꾸면 결과가 바로 나옵니다</span></a>
  </section>
  <section>
    <div class="io">
      <div class="card"><h2>넣는 값</h2><ul>${d.inputs.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="card"><h2>나오는 값</h2><ul>${d.outputs.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
    </div>
  </section>
  <section>
    <h2>화면 = 다운로드 엑셀</h2>
    <p>화면에 보이는 수치와 내려받는 엑셀의 수식은 같은 계산식입니다(파리티 검증). 받은 사람이 파일 안에서 값을 바꿔도 그대로 재계산됩니다. 딜 데이터는 서버로 전송되지 않고 브라우저 안에서만 계산됩니다.</p>
  </section>
  <section>
    <h2>관련 용어</h2>
    <div class="chips">${chips}<a href="/guide">용어사전 전체</a></div>
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
    { loc: BASE + '/trust', freq: 'monthly', pri: '0.6' },
    { loc: BASE + '/verification', freq: 'monthly', pri: '0.6' },
  ];
  deals.forEach(d => urls.push({ loc: `${BASE}/calc/${d}`, freq: 'monthly', pri: '0.7' }));
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
