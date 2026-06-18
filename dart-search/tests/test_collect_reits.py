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

    def test_dict_fields_coerced_to_str(self):
        # 네이버가 stockExchangeType / value 를 dict 로 줄 때도 문자열이어야
        # (SQLite 바인딩·SPA 렌더가 dict 면 깨짐)
        integration = {
            "stockName": {"name": "롯데리츠"},
            "stockExchangeType": {"code": "KOSDAQ", "name": "코스닥"},
            "totalInfos": [
                {"code": "marketValue", "key": "시가총액", "value": {"text": "9,999억"}},
                {"code": "dividendYield", "key": "배당수익률", "value": "5.50%"},
            ],
        }
        basic = {"closePrice": {"value": "4,100"}}
        r = cr.parse_naver("330590", integration, basic, cr.REIT_META["330590"])
        for key in ("name", "market", "price", "market_cap", "dividend_yield"):
            self.assertIsInstance(r.get(key), str, f"{key} 가 문자열이 아님: {r.get(key)!r}")
        # dict 의 우선순위(name>text>value>code)대로 값이 풀렸는지
        self.assertEqual(r["name"], "롯데리츠")
        self.assertEqual(r["market"], "코스닥")
        self.assertEqual(r["price"], "4,100원")
        self.assertEqual(r["market_cap"], "9,999억")
        self.assertEqual(r["dividend_yield"], "5.50")

    def test_str_field_helper(self):
        self.assertEqual(cr._str_field(None), "")
        self.assertEqual(cr._str_field("KOSPI"), "KOSPI")
        self.assertEqual(cr._str_field(1234), "1234")
        self.assertEqual(cr._str_field({"name": "A", "code": "B"}), "A")
        self.assertEqual(cr._str_field({"code": "B"}), "B")
        self.assertEqual(cr._str_field({}), "")


if __name__ == "__main__":
    unittest.main()
