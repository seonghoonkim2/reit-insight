#!/usr/bin/env python3
"""Audit moved numeric inputs and formulas against a separately generated source.

Unlike a cached-result comparison, this compares the dependency of every preserved
formula after independently mapping its references to the new coordinates. An
intentional single-reference corruption must be detected before the audit passes.
The workbook files are opened read-only and are never saved.
"""
import argparse
import json
import math
from pathlib import Path
import re
import sys

import openpyxl
from openpyxl.formula.tokenizer import Tokenizer
from workbook_layout import WorkbookLayout


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--before", type=Path, required=True)
parser.add_argument("--after", type=Path, required=True)
parser.add_argument("--map", type=Path, required=True, help="Published migration map for explicit removed/alias cells")
parser.add_argument("--report", type=Path)
parser.add_argument("--cases", help="Comma-separated case names, otherwise all matched files")
args = parser.parse_args()
declared = json.loads(args.map.read_text(encoding="utf-8"))["cells"]
selected = set(args.cases.split(",")) if args.cases else None


def formula_signature(formula, sheet, layout=None):
    result = []
    for token in Tokenizer(formula).items:
        if token.type == "WHITE-SPACE":
            continue
        if token.type != "OPERAND" or token.subtype != "RANGE":
            result.append((token.type, token.subtype, token.value.upper() if token.type != "OPERAND" or token.subtype != "TEXT" else token.value))
            continue
        value = token.value
        source, ref = value.rsplit("!", 1) if "!" in value else (sheet, value)
        source = source.strip("'").replace("''", "'")
        refs = ref.split(":")
        endpoints = []
        for address in refs:
            if not re.fullmatch(r"\$?[A-Za-z]+\$?\d+", address):
                raise ValueError("Unsupported reference in independent audit: " + value)
            dest, address = layout.resolve(source, address) if layout else (source, address)
            endpoints.append((dest.upper(), address.upper()))
        result.append(("REFERENCE", tuple(endpoints)))
    return result


def is_numeric(cell):
    return cell.data_type == "n" and isinstance(cell.value, (int, float)) and not isinstance(cell.value, bool)


results = []
for before in sorted(args.before.glob("*.xlsx")):
    after = args.after / before.name
    if not after.exists() or (selected and before.stem not in selected):
        continue
    old = openpyxl.load_workbook(before, data_only=False)
    new = openpyxl.load_workbook(after, data_only=False)
    layout = WorkbookLayout(new.sheetnames, source=old)
    record = {"case": before.stem, "numeric_inputs": 0, "categorical_inputs": 0, "formulas": 0, "aliases": [], "removed_duplicate_cells": [], "issues": []}
    if not layout.compact:
        # Development/refinance intentionally retain the original workbook.
        record["unchanged_layout"] = True
        if old.sheetnames != new.sheetnames:
            record["issues"].append("Unchanged deal sheet names differ")
    first_formula = None
    for sheet in old:
        for row in sheet:
            for cell in row:
                categorical = sheet.title == "01_Assumptions" and cell.column == 3 and 5 <= cell.row <= 85 and cell.data_type != "f" and isinstance(cell.value, str)
                if cell.data_type != "f" and not is_numeric(cell) and not categorical:
                    continue
                logical = sheet.title + "!" + cell.coordinate
                declaration = declared.get(logical, {}) if layout.compact else {}
                if layout.compact and sheet.title == "00_Cover" and cell.row == 22 and cell.column >= 3:
                    declaration = {"sheet": "운영수지", "cell": cell.column_letter + "18", "alias": True}
                if declaration.get("deleted"):
                    # Only explicitly identified duplicates may disappear.
                    if sheet.title not in ("00_Cover", "03_Capital_Stack"):
                        record["issues"].append("Unexpected numeric/formula deletion: " + logical)
                    record["removed_duplicate_cells"].append(logical)
                    continue
                try:
                    # Dynamic rules are independently encoded in WorkbookLayout.
                    # Only duplicate cover aliases use the published cell map.
                    if sheet.title == "00_Cover" and layout.compact and declaration.get("cell"):
                        dest_name, dest_ref = declaration["sheet"], declaration["cell"]
                    else:
                        dest_name, dest_ref = layout.resolve(sheet.title, cell.coordinate)
                    target = new[dest_name][dest_ref]
                    if declaration.get("alias"):
                        if target.value is None:
                            record["issues"].append(logical + " alias destination is empty: " + dest_name + "!" + dest_ref)
                        record["aliases"].append({"from": logical, "to": dest_name + "!" + dest_ref})
                        continue
                    if categorical:
                        record["categorical_inputs"] += 1
                        if target.value != cell.value:
                            record["issues"].append(logical + " categorical input differs at " + dest_name + "!" + dest_ref)
                    elif is_numeric(cell):
                        record["numeric_inputs"] += 1
                        if not is_numeric(target) or not math.isclose(cell.value, target.value, rel_tol=1e-12, abs_tol=1e-10):
                            record["issues"].append(logical + " numeric value differs at " + dest_name + "!" + dest_ref + ": " + repr(cell.value) + " -> " + repr(target.value))
                    else:
                        record["formulas"] += 1
                        expected = formula_signature(cell.value, sheet.title, layout)
                        actual = formula_signature(target.value, dest_name) if target.data_type == "f" else None
                        if actual != expected:
                            record["issues"].append(logical + " formula dependencies differ at " + dest_name + "!" + dest_ref + ": " + str(target.value))
                        if first_formula is None and "C" in cell.value:
                            first_formula = (cell.value, sheet.title, layout)
                except Exception as error:
                    record["issues"].append(logical + ": " + type(error).__name__ + " " + str(error))
    # Negative control: a shifted existing-cell reference is a valid Excel formula
    # but must fail this audit. No workbook is mutated for this probe.
    if first_formula:
        formula, sheet_name, first_layout = first_formula
        corrupted = re.sub(r"(\$?C\$?)(\d+)", lambda m: m[1] + str(int(m[2]) + 1), formula, count=1)
        record["wrong_reference_detected"] = formula_signature(formula, sheet_name, first_layout) != formula_signature(corrupted, sheet_name, first_layout)
        if not record["wrong_reference_detected"]:
            record["issues"].append("Independent comparison did not detect the deliberately shifted reference")
    old.close()
    new.close()
    results.append(record)
    print(("FAIL " if record["issues"] else "PASS ") + before.stem + ": " + str(record["numeric_inputs"]) + " numeric inputs, " + str(record["formulas"]) + " formula dependencies, " + str(len(record["issues"])) + " issues")
    for issue in record["issues"][:10]:
        print("  " + issue)

report = {"before": str(args.before), "after": str(args.after), "cases": results,
          "failed": sum(bool(case["issues"]) for case in results),
          "numeric_inputs": sum(case["numeric_inputs"] for case in results),
          "categorical_inputs": sum(case["categorical_inputs"] for case in results),
          "formulas": sum(case["formulas"] for case in results)}
if not results:
    parser.error("No matching workbook cases found")
if args.report:
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print("COMPACT LAYOUT " + ("FAIL" if report["failed"] else "OK") + " - " + str(len(results)) + " cases")
sys.exit(1 if report["failed"] else 0)
