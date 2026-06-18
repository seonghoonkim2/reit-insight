import os
import shutil
import unittest

import build_site


class TestBuildSite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        build_site.build("")  # 데모 데이터로 dist 생성
        cls.dist = build_site.DIST

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.dist, ignore_errors=True)

    def f(self, p):
        return os.path.join(self.dist, p)

    def read(self, p):
        with open(self.f(p), encoding="utf-8") as fh:
            return fh.read()

    def test_core_pages_exist(self):
        for p in ["index.html", "reits.html", "bonds.html", "sitemap.xml", "robots.txt"]:
            self.assertTrue(os.path.exists(self.f(p)), p)

    def test_reit_page(self):
        self.assertTrue(os.path.exists(self.f("reit/330590.html")))
        html = self.read("reit/330590.html")
        self.assertIn("롯데리츠", html)
        self.assertIn("배당수익률", html)
        self.assertIn("application/ld+json", html)  # 구조화 데이터

    def test_bond_page(self):
        self.assertTrue(os.path.exists(self.f("bond/KR6035651G47.html")))
        self.assertIn("표면금리", self.read("bond/KR6035651G47.html"))

    def test_home_is_reit_first(self):
        self.assertIn("상장리츠", self.read("index.html"))

    def test_old_version_noindex(self):
        # 정정 이전(구버전) 보고서는 noindex
        self.assertIn("noindex", self.read("filing/20260320000002.html"))

    def test_sitemap_includes_reits(self):
        sm = self.read("sitemap.xml")
        self.assertIn("reit/330590.html", sm)
        self.assertIn("bond/KR6035651G47.html", sm)


if __name__ == "__main__":
    unittest.main()
