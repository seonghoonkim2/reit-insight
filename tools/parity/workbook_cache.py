"""Verify exported OOXML caches independently of the browser cache evaluator.

The ordinary oracle is the Python ``formulas`` recalculation already used by
parity tests. Its EXACT(array) implementation does not broadcast like Excel, so
lease concentration cells use a separate, case-sensitive cash-rent ledger from
the unmodified contract inputs. Those independently derived cells are supplied
to the Python model to verify their downstream MAX/LARGE results as well.
"""
import io
import math
from numbers import Real
import posixpath
import re
import zipfile
from xml.etree import ElementTree as ET

import openpyxl

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
REL_ID = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
ERRORS = {'#REF!', '#VALUE!', '#DIV/0!', '#NAME?', '#NUM!', '#N/A', '#NULL!'}


def solution_values(solution):
    values = {}
    for key, value in solution.items():
        match = re.search(r"\]((?:[^']|'')+)'!([A-Z]+\d+)$", key, re.I)
        if not match:
            continue
        scalar = value.value[0][0]
        # numpy scalar types should have the same bool/number semantics as Excel.
        if hasattr(scalar, 'item'):
            scalar = scalar.item()
        values[match[1].replace("''", "'").upper() + '!' + match[2].upper()] = scalar
    return values


def formula_caches(source):
    """Read the cache itself, never ask a spreadsheet reader to recalculate."""
    with zipfile.ZipFile(source) as archive:
        rels = {rel.get('Id'): rel.get('Target') for rel in
                ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        workbook = ET.fromstring(archive.read('xl/workbook.xml'))
        for sheet in workbook.find('s:sheets', NS):
            target = rels[sheet.get(REL_ID)]
            path = target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join('xl', target))
            xml = ET.fromstring(archive.read(path))
            for cell in xml.findall('.//s:c', NS):
                formula = cell.find('s:f', NS)
                if formula is None:
                    continue
                value = cell.find('s:v', NS)
                yield {'key': sheet.get('name').upper() + '!' + cell.get('r').upper(),
                       'path': path, 'ref': cell.get('r'), 'formula': formula.text or '',
                       'type': cell.get('t', 'n'), 'has_value': value is not None,
                       'text': value.text if value is not None else None}


def verify_formula_caches(source, solution):
    expected = solution_values(solution)
    errors = []
    count = 0
    types = {'number': 0, 'string': 0, 'boolean': 0}
    for cell in formula_caches(source):
        count += 1
        key, kind, text = cell['key'], cell['type'], cell['text']
        if not cell['has_value']:
            errors.append(key + ': missing <v> formula cache')
            continue
        if key not in expected:
            errors.append(key + ': no independent recalculation result')
            continue
        want = expected[key]
        if kind == 'str':
            got = text or ''
            types['string'] += 1
            ok = isinstance(want, str) and want == got or want is None and got == ''
            if got in ERRORS:
                ok = False
        elif kind == 'b':
            types['boolean'] += 1
            got = text == '1'
            ok = text in ('0', '1') and isinstance(want, bool) and got == want
        elif kind == 'n':
            types['number'] += 1
            try:
                got = float(text)
                # Text or booleans must retain their types, not just coerce to 0/1.
                ok = isinstance(want, Real) and not isinstance(want, bool) and math.isfinite(got) and math.isfinite(want)
                ok = ok and math.isclose(got, float(want), rel_tol=1e-9, abs_tol=1e-7)
            except (TypeError, ValueError):
                got, ok = text, False
        else:
            got, ok = text, False
        if not ok:
            errors.append('%s: cached %s %r != independently calculated %r' % (key, kind, got, want))
    if not count:
        errors.append('No formula cells found: the test fixture must contain live formulas')
    return {'count': count, 'types': types, 'errors': errors}


def lease_group_inputs(source, model_keys):
    """Independent contractual-rent ledger, not an Excel formula interpreter."""
    wb = openpyxl.load_workbook(source, read_only=True, data_only=False)
    try:
        if 'Rent Roll' not in wb or '_Calc' not in wb:
            return {}
        grouped_cells = [cell for row in wb['_Calc'] for cell in row
                         if cell.data_type == 'f' and 'SUMPRODUCT(--EXACT(' in cell.value]
        if not grouped_cells:
            return {}
        rr = wb['Rent Roll']
        contracts = []
        for i, cell in enumerate(sorted(grouped_cells, key=lambda c: c.row)):
            if cell.coordinate != 'Y' + str(74 + i):
                raise AssertionError('Unexpected concentration-cell placement: ' + cell.coordinate)
            row = 5 + i
            name = rr['B' + str(row)].value
            name = '임차' + str(i + 1) if name in (None, '') else str(name)
            annual_rent = float(rr['D' + str(row)].value) * float(rr['E' + str(row)].value) * 12 / 1e6
            contracts.append((cell.coordinate, name, annual_rent))
        totals = {}
        for _, name, annual_rent in contracts:
            totals[name] = totals.get(name, 0) + annual_rent
        keys = {}
        for key in model_keys:
            match = re.search(r"\]([^']+)'!([A-Z]+\d+)$", key, re.I)
            if match:
                keys[match[1].upper() + '!' + match[2].upper()] = key
        seen, inputs = set(), {}
        for ref, name, _ in contracts:
            inputs[keys['_CALC!' + ref]] = 0 if name in seen else totals[name]
            seen.add(name)
        return inputs
    finally:
        wb.close()


def verify_negative_controls(source, solution):
    """Make sure missing/stale/mistyped caches cannot pass the actual checker."""
    records = list(formula_caches(source))
    numeric = next(cell for cell in records if cell['type'] == 'n' and cell['has_value'])
    string = next(cell for cell in records if cell['type'] == 'str' and cell['has_value'])
    edits = [('missing value', numeric, None, None),
             ('stale numeric value', numeric, 'n', '987654321012345'),
             ('nonfinite numeric value', numeric, 'n', 'NaN'),
             ('number replaced by boolean', numeric, 'b', '1'),
             ('stale string value', string, 'str', 'STALE CACHE'),
             ('string replaced by number', string, 'n', '0')]
    results = []
    with zipfile.ZipFile(source) as original:
        for name, cell, kind, text in edits:
            changed = io.BytesIO()
            with zipfile.ZipFile(changed, 'w') as archive:
                for info in original.infolist():
                    data = original.read(info.filename)
                    if info.filename == cell['path']:
                        xml = ET.fromstring(data)
                        target = next(c for c in xml.findall('.//s:c', NS) if c.get('r') == cell['ref'])
                        value = target.find('s:v', NS)
                        if kind is None:
                            target.remove(value)
                        else:
                            target.set('t', kind)
                            value.text = text
                        data = ET.tostring(xml, encoding='utf-8')
                    # writestr mutates ZipInfo offsets; do not reuse the source
                    # archive's objects across these independent corruptions.
                    archive.writestr(info.filename, data)
            changed.seek(0)
            errors = verify_formula_caches(changed, solution)['errors']
            results.append((name, any(error.startswith(cell['key'] + ':') for error in errors)))
    return results
