import Link from "next/link";
import type { Metadata } from "next";
import { getReits } from "@/lib/api";

export const revalidate = 300;
export const metadata: Metadata = { title: "상장리츠(REITs)", description: "한국 상장리츠를 섹터별로 검색·비교." };

type SP = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function ReitsPage({ searchParams }: { searchParams: SP }) {
  const q = one(searchParams.q);
  const sector = one(searchParams.sector);
  const data = await getReits({ q, sector });
  const reits = data?.reits || [];
  // 섹터 칩은 전체 목록에서
  const all = (await getReits())?.reits || reits;
  const sectors = Array.from(new Set(all.map((r) => r.sector).filter(Boolean))) as string[];

  const chip = (s: string) => `/reits?${new URLSearchParams({ ...(q ? { q } : {}), ...(s ? { sector: s } : {}) }).toString()}`;

  return (
    <main>
      <div className="crumb"><Link href="/">홈</Link> › 상장리츠</div>
      <h1 className="page">상장리츠 (REITs)</h1>

      <form className="filters" action="/reits" method="get">
        {sector && <input type="hidden" name="sector" value={sector} />}
        <input name="q" defaultValue={q} placeholder="리츠명·운용사 검색" style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 8 }} />
        <button type="submit" className="chip" style={{ cursor: "pointer" }}>검색</button>
      </form>

      <div className="filters">
        <Link className={!sector ? "on" : ""} href={q ? `/reits?q=${encodeURIComponent(q)}` : "/reits"}>전체</Link>
        {sectors.map((s) => (
          <Link key={s} className={sector === s ? "on" : ""} href={chip(s)}>{s}</Link>
        ))}
      </div>

      <div className="stat">총 <b>{reits.length}</b>개 리츠</div>
      <div className="card">
        {reits.map((r) => (
          <Link key={r.ticker} className="row" href={`/reit/${r.ticker}`}>
            <div className="t">{r.name} <span className="tag">{r.sector}</span></div>
            <div className="m">{r.ticker} · 배당수익률 {r.dividend_yield}% · {r.dividend_freq} 배당 · NAV {r.nav_ratio}</div>
          </Link>
        ))}
        {reits.length === 0 && <div className="row"><div className="m">일치하는 리츠가 없습니다.</div></div>}
      </div>
    </main>
  );
}
