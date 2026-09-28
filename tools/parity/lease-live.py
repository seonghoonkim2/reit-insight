#!/usr/bin/env python3
"""Recalculate real lease XLSX formulas and edit the original workbook in memory.

Screen results arrive from gen-lease-live.js; the site calculation implementation
is not copied into this checker. Three additional cash-ledger examples test the
economic boundary rules directly, independent of both calculation paths.
"""
import argparse
import json
import math
from pathlib import Path
import re
import time

import formulas
import openpyxl

ROOT = Path(__file__).resolve().parent
ERRORS = {'#REF!', '#VALUE!', '#DIV/0!', '#NAME?', '#NUM!', '#N/A', '#NULL!'}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dir', type=Path, default=ROOT / 'out' / 'lease-live')
parser.add_argument('--report', type=Path)
parser.add_argument('--cases', help='Optional comma-separated case names for diagnosis')
args = parser.parse_args()
manifest = json.loads((args.dir / 'manifest.json').read_text(encoding='utf-8'))
selected = set(args.cases.split(',')) if args.cases else None
report = {'cases': [], 'method': 'Application screen path versus recalculated exported formulas; in-memory input edits plus independent boundary ledgers'}


def column(index):
    return openpyxl.utils.get_column_letter(index)


for case in manifest['cases']:
    if selected and case['name'] not in selected:
        continue
    started = time.perf_counter()
    checks = []
    def check(name, passed, detail=None):
        checks.append({'name': name, 'passed': bool(passed), 'detail': detail})
        if not passed:
            print('  FAIL', name, detail)
    def close(name, actual, expected, tolerance=1e-6):
        if expected is None:
            check(name, actual is None or str(actual).strip() == '', {'actual': str(actual), 'expected': None})
            return
        try:
            got, want = float(actual), float(expected)
            difference = abs(got - want)
            check(name, math.isfinite(got) and math.isfinite(want) and difference <= tolerance,
                  {'actual': got, 'expected': want, 'difference': difference})
        except (ValueError, TypeError):
            check(name, False, {'actual': str(actual), 'expected': expected})

    file = args.dir / case['file']
    wb = openpyxl.load_workbook(file, read_only=False, data_only=False)
    rr, ar, op = wb['Rent Roll'], wb['A&R'], wb['운영수지']
    check('seven visible working sheets', len([s for s in wb if s.sheet_state == 'visible']) == 7)
    check('calculation and restoration sheets hidden', all(wb[s].sheet_state == 'hidden' for s in ('_Calc', '_Restore')))
    check('market CAM growth input exists', 'camG' in case['marketRefs'])
    close('screen sensitivity growth axis preserves the supplied market rate', case['sensitivityBase']['g'], case['market']['mktStepUp'] * 100, 1e-10)
    for year in range(case['hold'] + 1):
        for row in (5, 6):
            ref = column(year + 3) + str(row)
            check('operating income is a live formula ' + ref, op[ref].data_type == 'f', op[ref].value)
    for ref in ('C23', 'C24', 'C25', 'C27', 'C28', 'C75'):
        check('derived A&R field is formula-driven ' + ref, ar[ref].data_type == 'f', ar[ref].value)
        check('derived A&R field is not blue input ' + ref, ar[ref].font.color != ar['C26'].font.color)
    for i, lease in enumerate(case['leases'], 5):
        for col, key in [('D','area'), ('E','rentPP'), ('F','camPP'), ('G','deposit'), ('H','rentFreeRemain'), ('I','yrsToExp'), ('J','stepUp')]:
            value = rr[col + str(i)].value
            if lease[key] is None:
                check('blank contract input retained ' + col + str(i), value in (None, ''), value)
            else:
                close('unrounded contract input ' + col + str(i), value, lease[key], 1e-8)
    visible_text = '\n'.join(str(c.value) for s in wb if s.sheet_state == 'visible' for row in s for c in row if c.value is not None and c.data_type != 'f')
    check('no stale warning that lease inputs do not recalculate', '이 표의 값 수정은 임대수입에 반영되지 않습니다' not in visible_text)
    wb.close()

    model = formulas.ExcelModel().loads(str(file.resolve())).finish()
    baseline = model.calculate()
    keys = {}
    for key in baseline:
        match = re.search(r"\]([^']+)'!([A-Z]+\d+)$", key)
        if match:
            keys[match[1].upper() + '!' + match[2]] = key
    def raw(sol, ref):
        key = keys.get(ref.upper())
        return sol[key].value[0][0] if key in sol else None
    def compare_screen(label, sol, expected):
        error_cells = []
        for key, value in sol.items():
            try:
                if str(value.value[0][0]) in ERRORS:
                    error_cells.append(key)
            except Exception:
                pass
        check(label + ' no Excel errors', not error_cells, error_cells[:5])
        scalar_refs = {'IRR':'J5', 'IRRat':'J6', 'EM':'J7', 'commonIRR':'H5', 'prefIRR':'I5',
                       'commonEM':'H7', 'prefEM':'I7', 'minDSCR':'H13', 'coc':'H8',
                       'unlev':'H12', 'equity':'C55', 'loan':'C49', 'prefAmt':'C53', 'common':'C54', 'depSrcAmt':'H37'}
        for metric, ref in scalar_refs.items():
            close(label + ' ' + metric, raw(sol, 'A&R!' + ref), expected.get(metric), 1e-8 if 'IRR' in metric or metric == 'unlev' else 1e-6)
        for year in range(case['hold'] + 1):
            col = column(year + 3)
            for ref, value in [(col+'5', expected['inc']['rentY'][year]), (col+'6', expected['inc']['camY'][year]), (col+'18', expected['NOI'][year])]:
                close(label + ' operating ' + ref, raw(sol, '운영수지!' + ref), value)
        for year in range(case['hold']):
            col = column(year + 3)
            for row, metric in [(9,'DS'), (10,'DSCR'), (8,'endBal')]:
                close(label + ' debt ' + col + str(row), raw(sol, '대출!' + col + str(row)), expected[metric][year])
            close(label + ' equity cash Y' + str(year+1), raw(sol, '지분 현금흐름!' + column(year + 4) + '7'), expected['dist'][year])
        close(label + ' sensitivity centre follows current model', raw(sol, 'A&R!J61'), expected['IRR'], 1e-8)

    compare_screen('baseline', baseline, case['baseline'])
    for edit in case['edits']:
        overrides = {keys[ref.upper()]: value for ref, value in edit['inputs'].items()}
        solution = model.calculate(inputs=overrides)
        compare_screen(edit['name'], solution, edit['expected'])
        # A frozen download could still match its original screen. Requiring an
        # actual change after a source edit prevents that false positive.
        baseline_irr = float(raw(baseline, 'A&R!J5'))
        changed_irr = float(raw(solution, 'A&R!J5'))
        check(edit['name'] + ' materially changes total IRR', abs(changed_irr - baseline_irr) > 1e-7,
              {'before': baseline_irr, 'after': changed_irr})

    if case['manual'] in ('flat', 'rentfree25'):
        # Independently stated cash ledger: two fully occupied leases, no expiry,
        # no escalation, and either all 12 paid months or 25 initial free months.
        a, b = case['leases']
        for year in range(case['hold'] + 1):
            months = 12 if case['manual'] == 'flat' else [0, 0, 11, 12, 12][year]
            rent = (a['area'] * a['rentPP'] * months + b['area'] * b['rentPP'] * 12) / 1e6
            cam = (a['area'] * a['camPP'] + b['area'] * b['camPP']) * 12 / 1e6
            close('independent paid-month ledger rent Y'+str(year+1), raw(baseline, '운영수지!'+column(year+3)+'5'), rent)
            close('independent paid-month ledger CAM Y'+str(year+1), raw(baseline, '운영수지!'+column(year+3)+'6'), cam)
        if case['manual'] == 'flat':
            # Growth zero must remain zero in both the visible input and the
            # deposit settlement, rather than silently falling back to 3%.
            close('zero growth is not replaced by default', raw(baseline, 'A&R!C27'), 0, 1e-12)
    if case['name'] == 'fractional_hold5':
        lease = case['leases'][0]
        # Expiry at 2.01 belongs to the third annual contract bucket. That year
        # earns a full year's contractual rent; rollover starts in year four.
        expected_contract = lease['area'] * lease['rentPP'] * (1+lease['stepUp'])**2 * 12 / 1e6
        other = case['leases'][1]
        expected_other = other['area'] * other['rentPP'] * (1+case['market']['mktStepUp'])**2 * 12 / 1e6
        close('independent fractional-expiry current-contract bucket Y3', raw(baseline, '_Calc!E64'), expected_contract + expected_other)
        # Deliberately replace a current income formula result with an old,
        # fixed value. The screen/output comparison must detect the regression.
        rent_edit = next(e for e in case['edits'] if e['name'] == 'contract rent')
        overridden = {keys[k.upper()]: v for k,v in rent_edit['inputs'].items()}
        overridden[keys['운영수지!C5'.upper()]] = raw(baseline, '운영수지!C5')
        corrupt = model.calculate(inputs=overridden)
        check('negative control detects frozen rent result after source edit',
              abs(float(raw(corrupt, '운영수지!C5')) - rent_edit['expected']['inc']['rentY'][0]) > 0.01)
        check('validation catches corrupted income downstream',
              abs(float(raw(corrupt, 'A&R!J5')) - rent_edit['expected']['IRR']) > 1e-7)

    failed = sum(not c['passed'] for c in checks)
    record = {'name': case['name'], 'contracts': len(case['leases']), 'hold': case['hold'],
              'checks': checks, 'passed': len(checks)-failed, 'failed': failed,
              'seconds': round(time.perf_counter()-started, 3)}
    report['cases'].append(record)
    print(('FAIL ' if failed else 'PASS ') + case['name'] + ': ' + str(record['passed']) + ' passed, ' + str(failed) + ' failed; ' + str(record['seconds']) + 's')
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

report['passed'] = sum(c['passed'] for c in report['cases'])
report['failed'] = sum(c['failed'] for c in report['cases'])
if not report['cases']:
    parser.error('No matching cases')
if args.report:
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print('LEASE LIVE ' + ('FAIL' if report['failed'] else 'OK') + ' - ' + str(len(report['cases'])) + ' workbooks, ' + str(report['passed']) + ' checks passed, ' + str(report['failed']) + ' failed')
raise SystemExit(1 if report['failed'] else 0)
