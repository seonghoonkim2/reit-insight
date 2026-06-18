import os
import json
import tempfile
import threading
import unittest
import importlib
import urllib.request
import urllib.error
from urllib.parse import quote
from http.server import ThreadingHTTPServer

from . import fixtures


def http_get(base, path):
    try:
        with urllib.request.urlopen(base + path, timeout=10) as r:
            return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)


class TestApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.dbpath = os.path.join(cls.tmp, "t.db")
        os.environ["GONGSILENS_DB"] = cls.dbpath
        con = fixtures.seed(cls.dbpath)
        con.close()
        import api
        importlib.reload(api)  # DB_PATH 가 env 를 반영하도록
        cls.api = api
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), api.Handler)
        cls.port = cls.server.server_address[1]
        cls.base = f"http://127.0.0.1:{cls.port}"
        cls.t = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.t.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_healthz(self):
        code, body, _ = http_get(self.base, "/healthz")
        self.assertEqual(code, 200)
        d = json.loads(body)
        self.assertTrue(d["ok"])
        self.assertGreaterEqual(d["filings"], 5)

    def test_search_json(self):
        code, body, _ = http_get(self.base, "/api/v1/search?q=" + quote("우발부채"))
        self.assertEqual(code, 200)
        d = json.loads(body)
        self.assertGreater(d["count"], 0)
        self.assertIn(d["results"][0]["engine"], ("fts", "like"))

    def test_search_year_filter(self):
        code, body, _ = http_get(self.base, "/api/v1/search?q=" + quote("재고자산") + "&year=2024")
        d = json.loads(body)
        self.assertTrue(all(r["year"] == 2024 for r in d["results"]))

    def test_search_csv(self):
        code, body, headers = http_get(self.base, "/api/v1/search.csv?q=" + quote("우발부채"))
        self.assertEqual(code, 200)
        self.assertIn("text/csv", headers.get("Content-Type", ""))
        text = body.decode("utf-8")
        self.assertTrue(text.startswith("﻿"))  # 엑셀 BOM
        self.assertIn("회사명", text)

    def test_company(self):
        code, body, _ = http_get(self.base, "/api/v1/company/00000001")
        self.assertEqual(code, 200)
        d = json.loads(body)
        self.assertEqual(d["company"]["corp_name"], "샘플전자")
        self.assertGreaterEqual(len(d["filings"]), 2)

    def test_filing(self):
        code, body, _ = http_get(self.base, "/api/v1/filings/20260318000001")
        self.assertEqual(code, 200)
        d = json.loads(body)
        self.assertEqual(d["filing"]["corp_name"], "샘플전자")
        self.assertEqual(len(d["sections"]), 3)

    def test_group_and_diff(self):
        gkey = quote("00000002_사업보고서_2025")
        code, body, _ = http_get(self.base, "/api/v1/group/" + gkey)
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)["count"], 2)

        code, body, _ = http_get(self.base, "/api/v1/diff?a=20260325000002&b=20260320000002")
        self.assertEqual(code, 200)
        d = json.loads(body)["diff"]
        self.assertIn("II. 사업의 내용", d["new_sections"])

    def test_reits(self):
        code, body, _ = http_get(self.base, "/api/v1/reits")
        self.assertEqual(code, 200)
        self.assertGreaterEqual(json.loads(body)["count"], 8)
        code, body, _ = http_get(self.base, "/api/v1/reits?sector=" + quote("물류"))
        self.assertTrue(all(r["sector"] == "물류" for r in json.loads(body)["reits"]))

    def test_reit_detail_with_bonds(self):
        code, body, _ = http_get(self.base, "/api/v1/reit/330590")
        self.assertEqual(code, 200)
        d = json.loads(body)
        self.assertEqual(d["name"], "롯데리츠")
        self.assertIsInstance(d["portfolio"], list)
        self.assertTrue(any(b["isin"] == "KR6035651G47" for b in d["bonds"]))
        self.assertEqual(http_get(self.base, "/api/v1/reit/000000")[0], 404)

    def test_bonds(self):
        code, body, _ = http_get(self.base, "/api/v1/bonds")
        self.assertEqual(code, 200)
        self.assertGreaterEqual(json.loads(body)["count"], 5)
        code, body, _ = http_get(self.base, "/api/v1/bond/KR6035651G47")
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)["issuer"], "롯데리츠")
        self.assertEqual(http_get(self.base, "/api/v1/bond/XX")[0], 404)

    def test_404(self):
        code, _, _ = http_get(self.base, "/api/v1/company/ZZZ")
        self.assertEqual(code, 404)
        code, _, _ = http_get(self.base, "/nope")
        self.assertEqual(code, 404)


if __name__ == "__main__":
    unittest.main()
