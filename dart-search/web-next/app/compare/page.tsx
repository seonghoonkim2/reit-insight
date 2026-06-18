import Link from "next/link";
import type { Metadata } from "next";
import { getReits } from "@/lib/api";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "상장리츠 비교",
  description: "상장리츠의 배당수익률·NAV·신용등급·운용사를 한 표에서 비교.",
};

function ratingBadge(r?: string) {
  if (!r) return null;
  const cls = /^A/.test(r) ? "latest" : /^BBB/.test(r) ? "" : "amend";
  return <span className={`badge ${cls}`}>{r}</span>;
}

export default async function ComparePage() {
  const reits = ((await getReits())?.reits || [])
    .slice()
    .sort((a, b) => parseFloat(b.dividend_yield || "0") - parseFloat(a.dividend_yield || "0"));

  return (
    <main>
      <div className="crumb"><Link href="/">홈</Link> › 리츠 비교</div>
      <h1 className="page">상장리츠 비교 <span style={{ fontSize: 12, color: "var(--muted)" }}>(숫자는 예시)</span></h1>

      <div style={{ overflowX: "auto" }}>
        <table className="kvt" style={{ minWidth: 720, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["리츠", "섹터", "배당수익률", "배당주기", "주가/NAV", "신용등급", "운용사", "상장일"].map((h) => (
                <th key={h} style={{ borderBottom: "1px solid var(--border)", padding: "6px 12px 6px 0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reits.map((r) => (
              <tr key={r.ticker} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "6px 12px 6px 0" }}><Link href={`/reit/${r.ticker}`}>{r.name}</Link></td>
                <td>{r.sector}</td>
                <td>{r.dividend_yield}%</td>
                <td>{r.dividend_freq}</td>
                <td>{r.nav_ratio}</td>
                <td>{ratingBadge(r.credit_rating)}</td>
                <td>{r.amc}</td>
                <td>{r.listing_date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="kv" style={{ marginTop: 10 }}>배당수익률 높은 순. 숫자는 예시이며 투자 권유가 아닙니다.</div>
    </main>
  );
}
