#!/usr/bin/env python3
# 모델터 파리티 2단계 — 생성된 엑셀을 python `formulas` 수식 엔진으로 재계산해
# 화면 엔진 기대값(<딜>_expected.json)과 비교합니다.
#
# 사용:   python3 tools/parity/check.py office|logistics|dev|refi
#         + 자본구조 변형: office_nopref|office_nonpass|office_hold7
# 준비물: pip install formulas
import json
import os
import sys

import formulas

# 변형 → 기준 딜. 검증 셀 좌표는 기준 딜과 동일하고, 변형별 추가 확인만 얹는다.
VARIANTS = {
    'office_nopref': 'office',    # 우선주 끔
    'office_nonpass': 'office',   # 비도관(법인세 적용) → 세후 IRR이 세전과 달라야 함
    'office_hold7': 'office',     # 보유기간 7년
}
KNOWN = ('office', 'logistics', 'dev', 'refi') + tuple(VARIANTS)

deal = sys.argv[1] if len(sys.argv) > 1 else 'office'
if deal not in KNOWN:
    print('사용: python3 tools/parity/check.py ' + '|'.join(KNOWN))
    sys.exit(1)
base = VARIANTS.get(deal, deal)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
xlsx = os.path.join(OUT, deal + '_parity.xlsx')
expf = os.path.join(OUT, deal + '_expected.json')
if not (os.path.exists(xlsx) and os.path.exists(expf)):
    print('먼저 생성하세요: node tools/parity/gen-xlsx.js ' + deal)
    sys.exit(1)

exp = json.load(open(expf))
sol = formulas.ExcelModel().loads(xlsx).finish().calculate()


def cell(sheet, ref):
    tail = "]%s'!%s" % (sheet.upper(), ref.upper())
    for k, v in sol.items():
        if k.upper().endswith(tail):
            return float(v.value[0][0])
    raise KeyError(sheet + '!' + ref)


def cell_raw(sheet, ref):
    # float 강제 없이 원시값 반환 — 빈 값·엑셀 오류(#NUM! 등) 검사용. 미존재 셀은 None
    tail = "]%s'!%s" % (sheet.upper(), ref.upper())
    for k, v in sol.items():
        if k.upper().endswith(tail):
            try:
                return v.value[0][0]
            except Exception:
                return None
    return None


if base in ('office', 'logistics'):
    # 09_Return_Summary: C=보통주 · D=우선주 · E=총자기자본
    checks = [
        ('세전 IRR(총자기자본)', cell('09_Return_Summary', 'E5'), exp['IRR'], 0.001),
        ('세후 IRR(총자기자본)', cell('09_Return_Summary', 'E6'), exp['IRRat'], 0.001),
        ('EM(총자기자본)', cell('09_Return_Summary', 'E7'), exp['EM'], 0.01),
        ('평균 CoC(보통주)', cell('09_Return_Summary', 'C8'), exp['coc'], 0.001),
        ('최소 DSCR', cell('09_Return_Summary', 'C13'), exp['minDSCR'], 0.01),
        ('언레버드 IRR', cell('09_Return_Summary', 'C12'), exp['unlev'], 0.001),
    ]
elif base == 'dev':  # dev — 04_PROFITABILITY 요약 열 C
    checks = [
        ('분양수입', cell('04_PROFITABILITY', 'C5'), exp['rev'], max(1e-6, abs(exp['rev']) * 1e-9)),
        ('금융비(이자)', cell('04_PROFITABILITY', 'C14'), exp['interest'], max(1e-6, abs(exp['interest']) * 1e-7)),
        ('본PF 한도', cell('04_PROFITABILITY', 'C16'), exp['loan'], max(1e-6, abs(exp['loan']) * 1e-7)),
        ('사업이익', cell('04_PROFITABILITY', 'C21'), exp['profit'], max(1e-6, abs(exp['profit']) * 1e-7)),
        ('이익률', cell('04_PROFITABILITY', 'C22'), exp['margin'] / 100.0, 1e-9),
        ('종료 시 미상환', cell('04_PROFITABILITY', 'C26'), exp['pfEnd'], 1.0),
        ('Equity Multiple', cell('04_PROFITABILITY', 'C28'), exp['EM'], 1e-6),
        ('연환산 IRR', cell('04_PROFITABILITY', 'C29'), exp['IRR'], 1e-6),
    ]
else:  # refi — 02_Term_Sheets: C/D/E = 대안 1/2/3 (5=대출금 13=1차년 DSCR 14=최소 DSCR 15=총이자 16=만기잔액)
    cols = ['C', 'D', 'E']
    checks = []
    for i, row in enumerate(exp['rows'][:3]):
        c = cols[i]
        n = row.get('n', i + 1)
        checks += [
            ('대안%s 대출금' % n, cell('02_Term_Sheets', c + '5'), row['loan'], max(1e-6, abs(row['loan']) * 1e-9)),
            ('대안%s 1차년 DSCR' % n, cell('02_Term_Sheets', c + '13'), row['y1'], 0.001),
            ('대안%s 최소 DSCR' % n, cell('02_Term_Sheets', c + '14'), row['minDSCR'], 0.001),
            ('대안%s 총이자' % n, cell('02_Term_Sheets', c + '15'), row['totInt'], max(1.0, abs(row['totInt']) * 1e-7)),
            ('대안%s 만기잔액' % n, cell('02_Term_Sheets', c + '16'), row['balloon'], max(1.0, abs(row['balloon']) * 1e-7)),
        ]

fails = 0
for name, got, want, tol in checks:
    d = abs(got - want)
    okc = d <= tol
    print(('  V ' if okc else '  X ') + '%-16s excel=%.6f engine=%.6f (D%.2e)' % (name, got, want, d))
    if not okc:
        fails += 1

# ── 변형별 추가 확인 — 오버라이드가 엑셀에 실제 반영됐는지 (수치 대조와 별개의 구조 검사) ──
extra = []
if deal == 'office_nonpass':
    e5 = cell('09_Return_Summary', 'E5')
    e6 = cell('09_Return_Summary', 'E6')
    extra.append(('세후!=세전 IRR(엑셀)', abs(e6 - e5) > 0.0005, 'E5=%.6f E6=%.6f' % (e5, e6)))
    extra.append(('세후!=세전 IRR(엔진)', abs(exp['IRRat'] - exp['IRR']) > 0.0005,
                  'IRR=%.6f IRRat=%.6f' % (exp['IRR'], exp['IRRat'])))
elif deal == 'office_nopref':
    def pref_unused(v):
        # 우선주 미사용 판정: 0·빈 값 외에, CF가 전부 0이라 나오는 엑셀 오류(#NUM!·#DIV/0!)도
        # '숫자 없음'으로 허용. 0이 아닌 유한 숫자가 남아 있으면 실패(우선주 수치 잔존).
        if v is None:
            return True
        s = str(v).strip()
        if s == '' or s.startswith('#'):
            return True
        try:
            return float(s) == 0.0
        except (TypeError, ValueError):
            return False
    for ref, nm in (('D5', '세전 IRR'), ('D6', '세후 IRR'), ('D7', 'EM')):
        v = cell_raw('09_Return_Summary', ref)
        extra.append(('우선주 %s(%s) 비어있음' % (nm, ref), pref_unused(v), '값=%s' % (v,)))

for name, okc, detail in extra:
    print(('  V ' if okc else '  X ') + '%-22s %s' % (name, detail))
    if not okc:
        fails += 1

print('PARITY ' + ('FAIL %d' % fails if fails else 'OK') + ' — ' + deal)
sys.exit(1 if fails else 0)
