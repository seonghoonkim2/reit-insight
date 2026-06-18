import Link from "next/link";
import type { Metadata } from "next";
import Calculator from "@/components/Calculator";

export const metadata: Metadata = {
  title: "세후 배당 계산기",
  description: "투자금액·배당수익률·세율로 세후 배당금과 세후 수익률을 계산합니다.",
};

export default function ToolsPage() {
  return (
    <main>
      <div className="crumb"><Link href="/">홈</Link> › 금융 도구</div>
      <h1 className="page">세후 배당 계산기</h1>
      <Calculator />
    </main>
  );
}
