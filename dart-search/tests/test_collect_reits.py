import unittest

import collect_reits as cr


class TestCollectReits(unittest.TestCase):
    def test_parse_naver(self):
        r = cr.parse_naver("330590", cr.SAMPLE_INTEGRATION, cr.SAMPLE_BASIC, cr.REIT_META["330590"])
        self.assertEqual(r["name"], "롯데리츠")
        self.assertEqual(r["price"], "3,250원")
        self.assertEqual(r["market_cap"], "1조 2,345억")
        self.assertEqual(r["dividend_yield"], "6.70")
        self.assertEqual(r["market"], "KOSPI")
        # 정적 메타가 합쳐졌는지
        self.assertEqual(r["sector"], "리테일")
        self.assertIn("롯데백화점 강남점", r["portfolio"])

    def test_parse_empty_safe(self):
        r = cr.parse_naver("000000", {}, {}, {"name": "테스트", "sector": "오피스"})
        self.assertEqual(r["ticker"], "000000")
        self.assertEqual(r["name"], "테스트")
        self.assertNotIn("price", r)  # 가격 없으면 키 자체가 없어야

    def test_meta_covers_8_reits(self):
        self.assertEqual(len(cr.REIT_META), 8)
        for code, m in cr.REIT_META.items():
            self.assertTrue(m.get("name") and m.get("sector"))


if __name__ == "__main__":
    unittest.main()
