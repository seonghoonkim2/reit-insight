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
        # 네이버에서 추가로 뽑는 실데이터
        self.assertEqual(r["week52_high"], "3,800")
        self.assertEqual(r["week52_low"], "2,900")
        self.assertEqual(r["foreign_ratio"], "12.3%")
        # 정적 메타가 합쳐졌는지
        self.assertEqual(r["sector"], "리테일")
        self.assertIn("롯데백화점 강남점", r["portfolio"])

    def test_optional_naver_fields_absent(self):
        # totalInfos 가 비어도 52주/외국인 키는 없어야(렌더가 건너뜀)
        r = cr.parse_naver("330590", {"stockName": "X"}, {}, cr.REIT_META["330590"])
        for k in ("week52_high", "week52_low", "foreign_ratio"):
            self.assertNotIn(k, r)

    def test_parse_empty_safe(self):
        r = cr.parse_naver("000000", {}, {}, {"name": "테스트", "sector": "오피스"})
        self.assertEqual(r["ticker"], "000000")
        self.assertEqual(r["name"], "테스트")
        self.assertNotIn("price", r)  # 가격 없으면 키 자체가 없어야

    def test_meta_covers_8_reits(self):
        self.assertEqual(len(cr.REIT_META), 8)
        for code, m in cr.REIT_META.items():
            self.assertTrue(m.get("name") and m.get("sector"))

    def test_pay_months_present_and_valid(self):
        # 배당 캘린더용 pay_months 가 모든 리츠에 있고 1~12 범위인지
        for code, m in cr.REIT_META.items():
            pm = m.get("pay_months")
            self.assertTrue(isinstance(pm, list) and pm, f"{code} pay_months 없음")
            for mo in pm:
                self.assertTrue(1 <= mo <= 12, f"{code} 잘못된 월: {mo}")
        # parse 결과에도 그대로 합쳐져야 (네이버는 pay_months 를 주지 않음)
        r = cr.parse_naver("330590", {}, {}, cr.REIT_META["330590"])
        self.assertEqual(r["pay_months"], [3, 9])

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
