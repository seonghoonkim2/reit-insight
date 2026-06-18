import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBond, jsonLd, SITE_URL } from "@/lib/api";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: { isin: string } }): Promise<Metadata> {
  const b = await getBond(params.isin);
  if (!b) return { title: "채권" };
  return {
    title: `${b.bond_name} (${b.isin})`,
    description: `${b.issuer} 발행 채권 — 표면금리·만기·신용등급·조건과 AI 요약.`,
    alternates: { canonical: `${SITE_URL}/bond/${params.isin}` },
  };
}

const Row = ({ k, v }: { k: string; v?: string }) => (v ? (<tr><th>{k}</th><td>{v}</td></tr>) : null);

export default async function BondPage({ params }: { params: { isin: string } }) {
  const b = await getBond(params.isin);
  if (!b) notFound();

  const ld = {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: b.bond_name,
    category: b.bond_type,
    ...(b.issuer ? { provider: { "@type": "Organization", name: b.issuer } } : {}),
    url: `${SITE_URL}/bond/${b.isin}`,
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(ld)} />
      <div className="crumb"><Link href="/">홈</Link> › <Link href="/bonds">리츠 발행 채권</Link></div>
      <h1 className="page">
        {b.bond_name} {b.credit_rating && <span className="badge latest">{b.credit_rating}</span>}
      </h1>
      <div className="kv">
        ISIN {b.isin} · 발행{" "}
        {b.issuer_code ? <Link href={`/reit/${b.issuer_code}`}>{b.issuer}</Link> : b.issuer}
        {b.source_url && <> · <a href={b.source_url} target="_blank" rel="noopener noreferrer">출처 ↗</a></>}
      </div>

      <h2 className="sec">발행 정보 <span style={{ fontSize: 12, color: "var(--muted)" }}>(숫자는 예시)</span></h2>
      <div className="vbox">
        <table className="kvt"><tbody>
          <Row k="채권 종류" v={b.bond_type} /><Row k="표면금리" v={b.coupon_rate} />
          <Row k="금리 유형" v={b.interest_type} /><Row k="이자지급주기" v={b.coupon_freq} />
          <Row k="발행일" v={b.issue_date} /><Row k="만기일" v={b.maturity_date} />
          <Row k="발행액" v={b.issue_amount} /><Row k="잔존액" v={b.outstanding} />
          <Row k="변제순위" v={b.seniority} /><Row k="보증여부" v={b.guaranteed} />
          <Row k="신용등급" v={b.credit_rating} /><Row k="상장여부" v={b.listed} />
        </tbody></table>
      </div>

      <div className="vadd">
        <div className="vbox"><h3>🤖 AI 요약 (참고)</h3><p>{b.summary || "준비 중"}</p></div>
        <div className="vbox">
          <h3>📌 핵심 포인트</h3>
          {b.key_points && b.key_points.length ? (
            <ul className="points">{b.key_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
          ) : <p>준비 중</p>}
        </div>
      </div>

      {b.issuer_code && (
        <p><Link href={`/reit/${b.issuer_code}`}>← 발행 리츠 ({b.issuer}) 상세</Link></p>
      )}
    </main>
  );
}
