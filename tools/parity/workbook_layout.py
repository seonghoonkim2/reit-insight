"""Resolve logical model cells without rewriting the workbook under test.

The compact layout moves existing calculations. These independent QA mappings are
only used for assertions and input overrides; the formulas evaluator always reads
the actual exported formulas and actual destination cell addresses.
"""
import re


def column_number(label):
    value = 0
    for letter in label:
        value = value * 26 + ord(letter) - 64
    return value


def column_label(number):
    label = ""
    while number:
        number, digit = divmod(number - 1, 26)
        label = chr(65 + digit) + label
    return label


class WorkbookLayout:
    def __init__(self, sheet_names, source=None):
        self.compact = "A&R" in sheet_names
        self.source = source

    def resolve(self, sheet, ref):
        if not self.compact:
            return sheet, ref
        name = sheet.upper()
        match = re.fullmatch(r"(\$?)([A-Z]+)(\$?)(\d+)", ref.upper())
        if not match:
            raise ValueError("Expected one cell: " + sheet + "!" + ref)
        col_abs, col, row_abs, row = match.groups()
        row = int(row)
        target_sheet = {
            "04_OPERATING_PROFORMA": "운영수지",
            "05_DEBT_SCHEDULE": "대출",
            "06_TAX_DISPOSITION": "세무·매각",
            "08_EQUITY_CASHFLOW": "지분 현금흐름",
            "11_VALIDATION_CHECKS": "검증",
        }.get(name, sheet)
        if name == "01_ASSUMPTIONS":
            target_sheet = "A&R"
            if col == "F":
                col = "E"
            elif col == "E":
                raise KeyError("Removed assumption classification column: " + ref)
        elif name == "09_RETURN_SUMMARY":
            target_sheet, col = "A&R", column_label(column_number(col) + 5)
        elif name == "10_SENSITIVITY":
            target_sheet, col, row = "A&R", column_label(column_number(col) + 5), row + 46
        elif name == "02_SOURCES_USES":
            target_sheet, col, row = "A&R", {"B": "G", "C": "H", "D": "I", "E": "J" if row <= 9 else "L"}[col], row + 23
        elif name == "03_CAPITAL_STACK":
            if col in ("C", "D") and row == 10:
                return "A&R", col_abs + {"C": "H", "D": "I"}[col] + row_abs + "32"
            if col not in ("B", "C", "D", "E", "F", "G") or not 5 <= row <= 9:
                raise KeyError("Capital stack label is consolidated: " + ref)
            target_sheet, col, row = "A&R", {"B": "G", "C": "H", "D": "I", "E": "K", "F": "J", "G": "L"}[col], row + 30
        elif name == "07_EQUITY_WATERFALL":
            target_sheet, row = "지분 현금흐름", row + 13
            if column_number(col) >= 3:
                col = column_label(column_number(col) + 1)
        elif name == "00_COVER":
            aliases = {"C26": "H5", "G26": "J5", "C27": "H7", "G27": "J7", "G28": "H13", "D36": "H21"}
            key = col + str(row)
            if key not in aliases:
                raise KeyError("Removed duplicate cover cell: " + ref)
            mapped = re.fullmatch(r"([A-Z]+)(\d+)", aliases[key])
            target_sheet, col, row = "A&R", mapped[1], int(mapped[2])
        elif name == "01_RENT_ROLL":
            target_sheet = "Rent Roll"
        elif name in ("02_MARKET_ASSUMPTIONS", "LEASE_RISK", "LEASE_NOI_BUILDUP"):
            if self.source is None:
                raise KeyError("Dynamic rent-roll offsets require the original workbook")
            def max_row(source_name):
                # Original generator formats may contain empty styled cells.
                # They count toward the actual section placement as in Excel.
                return self.source[source_name].max_row
            if name == "LEASE_NOI_BUILDUP":
                target_sheet, row = "운영수지", row + max_row("04_Operating_ProForma") + 3
            else:
                target_sheet, row = "Rent Roll", row + max_row("01_Rent_Roll") + 3
                if name == "LEASE_RISK":
                    row += max_row("02_Market_Assumptions") + 3
        return target_sheet, col_abs + col + row_abs + str(row)

    def key(self, sheet, ref):
        sheet, ref = self.resolve(sheet, ref)
        return sheet.upper() + "!" + ref.upper()
