import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import "./globals.css";
import SearchBar from "@/components/SearchBar";
import Disclaimer from "@/components/Disclaimer";
import { SITE_URL } from "@/lib/api";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "리츠인사이트 | 상장리츠(REITs) 정보·배당·공시·발행채권", template: "%s | 리츠인사이트" },
  description: "한국 상장리츠(REITs)를 핵심지표·배당·포트폴리오·AI 요약으로. 공시 전문검색과 리츠 발행 채권까지.",
  openGraph: { siteName: "리츠인사이트", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="top">
          <div className="topbar">
            <Link className="brand" href="/">🏢 리츠인사이트<small>상장리츠 · 공시 · 채권</small></Link>
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
