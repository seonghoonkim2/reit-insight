import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import "./globals.css";
import SearchBar from "@/components/SearchBar";
import Disclaimer from "@/components/Disclaimer";
import { SITE_URL } from "@/lib/api";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "공시렌즈 | DART 사업보고서 전문 검색", template: "%s | 공시렌즈" },
  description: "DART 사업보고서를 회사별·연도별·섹션별로 검색하고 비교하는 공시 리서치 검색엔진",
  openGraph: { siteName: "공시렌즈", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="top">
          <div className="topbar">
            <Link className="brand" href="/">🔎 공시렌즈<small>DART 사업보고서 검색</small></Link>
            <Suspense>
              <SearchBar />
            </Suspense>
          </div>
        </header>
        <div className="wrap">
          {children}
          <Disclaimer />
        </div>
      </body>
    </html>
  );
}
