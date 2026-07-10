#!/usr/bin/env python3
# 모델터 파리티 2단계 — 생성된 엑셀을 python `formulas` 수식 엔진으로 재계산해
# 화면 엔진 기대값(<딜>_expected.json)과 비교합니다.
#
# 사용:   python3 tools/parity/check.py office|logistics|dev|refi
# 준비물: pip install formulas
import json
import os
import sys

import formulas

deal = sys.argv[1] if len(sys.argv) > 1 else 'office'
if deal not in ('office', 'logistics', 'dev', 'refi'):
    print('사용: python3 tools/parity/check.py office|logistics|dev|refi')
    sys.exit(1)

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


if deal in ('office', 'logistics'):
    # 09_Return_Summary: C=보통주 · D=우선주 · E=총자기자본
    checks = [
        ('세전 IRR(총자기자본)', cell('09_Return_Summary', 'E5'), exp['IRR'], 0.001),
        ('세후 IRR(총자기자본)', cell('09_Return_Summary', 'E6'), exp['IRRat'], 0.001),
        ('EM(총자기자본)', cell('09_Return_Summary', 'E7'), exp['EM'], 0.01),
        ('평균 CoC(보통주)', cell('09_Return_Summary', 'C8'), exp['coc'], 0.001),
        ('최소 DSCR', cell('09_Return_Summary', 'C13'), exp['minDSCR'], 0.01),
        ('언레버드 IRR', cell('09_Return_Summary', 'C12'), exp['unlev'], 0.001),
    ]
elif deal == 'dev':  # dev — 04_PROFITABILITY 요약 열 C
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
print('PARITY ' + ('FAIL %d' % fails if fails else 'OK') + ' — ' + deal)
sys.exit(1 if fails else 0)
