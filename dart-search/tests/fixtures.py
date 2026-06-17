"""테스트 공용 픽스처: web/demo-data.js 를 단일 소스로 SQLite 시드."""
import os
import re
import sys
import json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import db  # noqa: E402


def load_demo_reports():
    with open(os.path.join(ROOT, "web", "demo-data.js"), encoding="utf-8") as f:
        txt = f.read()
    m = re.search(r"window\.__DART_DATA__\s*=\s*(\{.*\});", txt, re.S)
    return json.loads(m.group(1))["reports"]


def seed(path=":memory:"):
    con = db.connect(path)
    db.init_schema(con)
    for r in load_demo_reports():
        db.save_report(con, r)
    return con
