import Link from "next/link";
import type { Metadata } from "next";
import { getBonds } from "@/lib/api";

export const revalidate = 300;
export const metadata: Metadata = { title: "리츠 발행 채권", description: "상장리츠가 발행한 채권을 ISIN별로 정리." };

type SP = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

function ratingBadge(r?: string) {
  if (!r) return null;
  const cls = /^A/.test(r) ? "latest" : /^BBB/.test(r) ? "" : "amend";
  return <span className={`badge ${cls}`}>{r}</span>;
}

export default async function BondsPage({ searchParams }: { searchParams: SP }) {
  const q = one(searchParams.q);
  const data = await getBonds({ q });
  const bonds = data?.bonds || [];

  return (
    <main>
      <div className="crumb"><Link href="/">홈</Link> › 리츠 발행 채권</div>
      <h1 className="page">리츠 발행 채권</h1>
      <div className="kv">상장리츠가 발행한 채권을 ISIN별로 정리했습니다. (숫자는 예시)</div>

      <form className="filters" action="/bonds" method="get">
        <input name="q" defaultValue={q} placeholder="채권명·발행 리츠·ISIN·등급 검색" style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 8 }} />
        <button type="submit" className="chip" style={{ cursor: "pointer" }}>검색</button>
      </form>

      <div className="stat">총 <b>{bonds.length}</b>건</div>
      <div className="card">
        {bonds.map((b) => (
          <Link key={b.isin} className="row" href={`/bond/${b.isin}`}>
            <div className="t">{b.bond_name} {ratingBadge(b.credit_rating)}</div>
            <div className="m">{b.issuer} · 표면 {b.coupon_rate} · 만기 {b.maturity_date}</div>
          </Link>
        ))}
        {bonds.length === 0 && <div className="row"><div className="m">일치하는 채권이 없습니다.</div></div>}
      </div>
    </main>
  );
}
