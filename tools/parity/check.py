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
    'office_nodebt': 'office',    # 무차입(LTV 0) — 커버리지 분모 0 경계
    'office_vac100': 'office',    # 공실 100% — 수입 0 경계(IRR 미정의)
}
KNOWN = ('office', 'logistics', 'dev', 'refi') + tuple(VARIANTS)

# 수치 대조가 성립하지 않는 퇴화 변형 — 엔진이 IRR 등을 null 로 돌려주지만 다운로드는 실행된다.
# 여기서 지키는 건 "파일이 열리는가 · 오류가 노출되지 않는가 · 화면처럼 공란인가" 세 가지.
DEGENERATE = {'office_vac100'}

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


if deal in DEGENERATE:
    checks = []
elif base in ('office', 'logistics'):
    # 09_Return_Summary: C=보통주 · D=우선주 · E=총자기자본
    checks = [
        ('세전 IRR(총자기자본)', cell('09_Return_Summary', 'E5'), exp['IRR'], 0.001),
        ('세후 IRR(총자기자본)', cell('09_Return_Summary', 'E6'), exp['IRRat'], 0.001),
        ('EM(총자기자본)', cell('09_Return_Summary', 'E7'), exp['EM'], 0.01),
        ('평균 CoC(보통주)', cell('09_Return_Summary', 'C8'), exp['coc'], 0.001),
        ('언레버드 IRR', cell('09_Return_Summary', 'C12'), exp['unlev'], 0.001),
    ]
    # 무차입 변형은 커버리지 지표가 정의되지 않아 공란이 정답 — 값 비교 대신 아래 변형 검사에서 '공란'을 확인한다.
    if deal != 'office_nodebt':
        checks.insert(4, ('최소 DSCR', cell('09_Return_Summary', 'C13'), exp['minDSCR'], 0.01))
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

def scan_nonfinite():
    # 숫자 셀에 비유한값(null·NaN·Infinity)이 들어가면 엑셀이 파일을 '손상됨'으로 거부한다.
    import zipfile as _zip
    bad = []
    with _zip.ZipFile(xlsx) as _z:
        for n in _z.namelist():
            if not n.endswith('.xml'):
                continue
            b = _z.read(n)
            for tok in (b'<v>null</v>', b'<v>NaN</v>', b'<v>Infinity</v>', b'<v>-Infinity</v>', b'<v>undefined</v>'):
                if tok in b:
                    bad.append(n + ':' + tok.decode())
    return bad


_ERR_TOKENS = ('#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#NULL!')


def scan_error_cells():
    # 오류 토큰이 산출물 어디에도 남으면 안 된다 — 표지까지 전파되면 신뢰가 깨진다.
    import re as _re
    hits = []
    for _k, _v in sol.items():
        try:
            _val = _v.value[0][0]
        except Exception:
            continue
        if any(e in str(_val) for e in _ERR_TOKENS):
            _m = _re.search(r"'\[.*?\]([^']+)'!([A-Z]+\d+)", _k)
            hits.append(_m.group(1) + '!' + _m.group(2) if _m else _k)
    return sorted(set(hits))


# ── 산출물 구조 검사 — 전 딜 공통. 수치가 맞아도 파일이 깨지거나 오류가 노출되면 실패다.
#    (외부 벤치마크 대조 2026-08-10: 무차입 경계에서 두 결함이 동시에 실제 발생했음)
_nf = scan_nonfinite()
_ec = scan_error_cells()
extra = [
    ('숫자 셀에 비유한값 없음', not _nf, '위반=%s' % (_nf or '없음',)),
    ('엑셀 오류 토큰 0', not _ec, '검출=%s' % (_ec[:6] or '없음',)),
]

# 파일이 스스로를 FAIL 이라 말하면 안 된다 — 검증 시트의 종합 판정은 항상 PASS 여야 한다.
# (2026-08-10: 조달 합계에서 승계 보증금이 빠져 모든 오피스·물류 다운로드가 'Uses=Sources FAIL'
#  과 '종합 판정 FAIL(9/10)' 을 달고 나가던 결함을 잡아낸 검사)
# 퇴화 변형은 제외 — 공실 100% 처럼 경제적으로 실제 실패하는 딜은 FAIL 이 맞는 답이다.
if base in ('office', 'logistics') and deal not in DEGENERATE:
    _v15 = cell_raw('11_Validation_Checks', 'E15')
    _c15 = cell_raw('11_Validation_Checks', 'C15')
    extra.append(('검증 시트 종합 판정 PASS', str(_v15).strip() == 'PASS', '판정=%r 집계=%r' % (_v15, _c15)))

# ── 변형별 추가 확인 — 오버라이드가 엑셀에 실제 반영됐는지 (수치 대조와 별개의 구조 검사) ──
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
elif deal == 'office_nodebt':
    # 무차입에서는 커버리지 지표가 정의되지 않는다. 파일 손상·오류 토큰은 위 공통 검사가 잡고,
    # 여기서는 "0 으로 오독되지 않고 공란인가"만 추가로 본다.
    for ref, nm in (('C13', '최소 DSCR'),):
        v = cell_raw('09_Return_Summary', ref)
        blank = v is None or str(v).strip() == ''
        extra.append(('%s(%s) 공란 — 0 으로 오독 금지' % (nm, ref), blank, '값=%r' % (v,)))
elif deal == 'office_vac100':
    # 수입이 0이면 자기자본 현금흐름이 부호를 바꾸지 않아 IRR 이 존재하지 않는다.
    # 화면은 '—' 를 보여주므로 엑셀도 공란이어야 파리티가 성립한다(#NUM! 노출 금지).
    for sheet, ref, nm in (('09_Return_Summary', 'E5', '세전 IRR(총자기자본)'),
                           ('09_Return_Summary', 'C5', '세전 IRR(보통주)'),
                           ('00_Cover', 'C25', '표지 보통주 IRR'),
                           ('00_Cover', 'G25', '표지 총자기자본 IRR')):
        v = cell_raw(sheet, ref)
        blank = v is None or str(v).strip() == ''
        extra.append(('%s(%s!%s) 공란' % (nm, sheet, ref), blank, '값=%r' % (v,)))

for name, okc, detail in extra:
    print(('  V ' if okc else '  X ') + '%-22s %s' % (name, detail))
    if not okc:
        fails += 1

print('PARITY ' + ('FAIL %d' % fails if fails else 'OK') + ' — ' + deal)
sys.exit(1 if fails else 0)
