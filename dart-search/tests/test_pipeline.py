import unittest

from . import fixtures
import db
import collect
import search
import diff
import financials
import bulk


class TestCollectParse(unittest.TestCase):
    XML = (
        "<DOCUMENT><BODY>"
        "<TITLE>I. 회사의 개요</TITLE><P>당사는 전자제품 제조 &amp; 판매 기업.</P>"
        "<TITLE>II. 사업의 내용</TITLE><P>반도체, 디스플레이.</P>"
        "<TABLE><TR><TD>매출액</TD><TD>300조원</TD></TR></TABLE>"
        "<TITLE>III. 재무에 관한 사항</TITLE><P>우발부채 약정.</P>"
        "</BODY></DOCUMENT>"
    )

    def test_sections_titles_and_path(self):
        secs, full, trunc = collect.parse_report_text(self.XML)
        self.assertEqual([s["title"] for s in secs],
                         ["I. 회사의 개요", "II. 사업의 내용", "III. 재무에 관한 사항"])
        self.assertFalse(trunc)
        self.assertNotIn("<", full)  # 태그 제거
        self.assertIn("전자제품 제조 & 판매", full)  # 엔티티 복원

    def test_table_extraction(self):
        secs, _, _ = collect.parse_report_text(self.XML)
        self.assertIn("매출액 | 300조원", secs[1]["tables"][0])

    def test_truncation(self):
        big = "<TITLE>X</TITLE><P>" + ("가" * 50) + "</P>"
        secs, full, trunc = collect.parse_report_text(big, max_total_chars=10)
        self.assertTrue(trunc)
        self.assertLessEqual(len(full), 10)

    def test_helpers(self):
        self.assertEqual(collect._business_year("사업보고서 (2025.12)", "20260318"), "2025")
        self.assertEqual(collect._business_year("사업보고서", "20260318"), "2026")
        self.assertEqual(collect._amendment_type("[기재정정]사업보고서"), "기재정정")
        self.assertIsNone(collect._amendment_type("사업보고서"))


class TestDbAndSearch(unittest.TestCase):
    def setUp(self):
        self.con = fixtures.seed()

    def test_counts(self):
        n = self.con.execute("SELECT COUNT(*) FROM filings").fetchone()[0]
        self.assertGreaterEqual(n, 5)  # 데모: 5건(정정 구버전 포함)

    def test_fts_korean(self):
        if db.detect_fts(self.con) != "trigram":
            self.skipTest("trigram FTS 미지원 빌드")
        res = search.search(self.con, "우발부채")
        self.assertTrue(res)
        self.assertEqual(res[0]["engine"], "fts")

    def test_like_fallback_short_term(self):
        res = search.search(self.con, "PF")  # 2글자 → LIKE 폴백
        self.assertTrue(res)
        self.assertEqual(res[0]["engine"], "like")

    def test_year_filter(self):
        res = search.search(self.con, "재고자산", year="2024")
        self.assertTrue(all(r["year"] == 2024 for r in res))

    def test_sort_recent(self):
        res = search.search(self.con, "우발부채", sort="recent")
        dates = [r["rcept_dt"] for r in res]
        self.assertEqual(dates, sorted(dates, reverse=True))

    def test_group_versions(self):
        vs = db.get_group_versions(self.con, "00000002_사업보고서_2025")
        self.assertEqual(len(vs), 2)
        latest = [v for v in vs if v["is_latest_version"]]
        self.assertEqual(len(latest), 1)

    def test_sections_for_diff_shape(self):
        secs = db.sections_for_diff(self.con, "20260325000002")
        self.assertTrue(secs and "title" in secs[0] and "text" in secs[0])


class TestDiff(unittest.TestCase):
    def test_compare_amendment(self):
        con = fixtures.seed()
        d = diff.compare(
            {"sections": db.sections_for_diff(con, "20260325000002")},  # 정정후
            {"sections": db.sections_for_diff(con, "20260320000002")},  # 정정전
        )
        self.assertIn("II. 사업의 내용", d["new_sections"])
        self.assertTrue(any(c["title"] == "III. 재무에 관한 사항" for c in d["changed_sections"]))
        kd = {x["keyword"]: x["delta"] for x in d["keyword_delta"]}
        self.assertGreater(kd.get("PF", 0), 0)


class TestFinancials(unittest.TestCase):
    def test_parse(self):
        facts = financials.parse_financials("C", "005930", "2025", financials.SELFTEST_RESPONSE)
        self.assertEqual(len(facts), 3)
        self.assertEqual(facts[0]["account_nm"], "매출액")
        self.assertEqual(financials.parse_financials("C", "S", "2025", {"status": "013"}), [])


class TestBulkQueue(unittest.TestCase):
    def test_queue_resume(self):
        con = db.connect(":memory:")
        db.init_schema(con)

        def fake(code):
            if code == "000404":
                return None
            return {"corp_code": "00" + code, "corp_name": "회사" + code, "stock_code": code,
                    "rcept_no": "2026" + code + "0001", "report_nm": "사업보고서 (2025.12)",
                    "year": "2025", "filing_group_key": "g" + code, "is_latest_version": True,
                    "dart_url": "u", "char_count": 1,
                    "sections": [{"title": "I", "section_path": "I", "text": "x"}]}

        added = bulk.enqueue_companies(con, ["000001", "000002", "000404"])
        self.assertEqual(added, 3)
        self.assertEqual(bulk.enqueue_companies(con, ["000001"]), 0)  # 중복 방지
        bulk.run_queue(con, fake, limit=100, rate=0)
        self.assertEqual(con.execute("SELECT COUNT(*) FROM filings").fetchone()[0], 2)
        self.assertEqual(db.job_counts(con).get("done"), 3)


if __name__ == "__main__":
    unittest.main()
