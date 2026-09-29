#!/usr/bin/env python3
"""Recalculate edited output files, including every validation formula.

node tools/qa/noi-direct.js --out tools/parity/out/noi-direct
python tools/parity/noi-direct.py [output directory]
Uses the existing parity dependencies. No native Excel or source edit.
"""
import math
from pathlib import Path
import sys
import warnings

import formulas

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools' / 'parity'))
from workbook_cache import ERRORS, lease_group_inputs, solution_values, verify_formula_caches

warnings.filterwarnings('ignore', category=FutureWarning)
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'tools' / 'parity' / 'out' / 'noi-direct'
scenarios = [
    ('flat baseline', {}, {'운영수지!C18': 7500, '운영수지!H18': 7500, '검증!E30': 'PASS', '검증!E19': 'PASS'}),
    ('zero NOI', {'C91': 0}, {'운영수지!C18': 0, '검증!E30': 'PASS', '검증!E19': '비교 불가'}),
    ('negative NOI', {'C91': -500}, {'운영수지!C18': -500, '검증!E30': 'PASS', '검증!E19': '비교 불가'}),
    ('no debt', {'C45': 0}, {'대출!C9': 0, '검증!E21': '비교 불가'}),
    ('NOI growth deposit', {'C91': 9000, 'C92': .04, 'C93': 6000}, {
        '운영수지!H18': 9000 * 1.04 ** 5, 'A&R!C75': 6000, '검증!E30': 'PASS', '검증!E19': 'FAIL'}),
    ('negative deposit pasted', {'C93': -1}, {'검증!E30': 'FAIL'}),
    ('invalid growth pasted', {'C92': .31}, {'검증!E30': 'FAIL'}),
]
checks = 0
for filename in ['direct_flat.xlsx', 'logistics_rent_source.xlsx', 'lease_separate.xlsx']:
    source = OUT / filename
    if not source.exists():
        raise SystemExit('Generate fixtures first: node tools/qa/noi-direct.js --out tools/parity/out/noi-direct')
    model = formulas.ExcelModel().loads(str(source)).finish()
    baseline = model.calculate()
    grouped = lease_group_inputs(str(source), baseline)
    if grouped:
        baseline = model.calculate(inputs=grouped)
    cache = verify_formula_caches(str(source), baseline)
    assert not cache['errors'], cache['errors']
    checks += cache['count']
    print('PASS: independent cache ' + filename)
    if filename != 'direct_flat.xlsx':
        continue
    def input_key(ref):
        return next(k for k in model.dsp.data_nodes if k.endswith("]A&R'!" + ref))
    for name, changes, expected in scenarios:
        values = solution_values(model.calculate(inputs={input_key(k): v for k, v in changes.items()}))
        errors = [(k, str(v)) for k, v in values.items() if isinstance(v, str) and v in ERRORS]
        assert not errors, (name, errors)
        checks += len(values)
        for key, want in expected.items():
            actual = values[key.upper()]
            assert (math.isclose(float(actual), want, rel_tol=1e-9, abs_tol=1e-7) if isinstance(want, (int, float)) else actual == want), (name, key, actual, want)
            checks += 1
        print('PASS: ' + name)
print(f'PASS: {checks} formula/value checks, {len(scenarios)} workbook edit scenarios')
