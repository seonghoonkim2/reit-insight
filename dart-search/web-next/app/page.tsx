import Link from "next/link";
import { getReits, getBonds } from "@/lib/api";

export const revalidate = 300;

function ratingBadge(r?: string) {
  if (!r) return null;
  const cls = /^A/.test(r) || r.includes("국채") ? "latest" : /^BBB/.test(r) ? "" : "amend";
  return <span className={`badge ${cls}`}>{r}</span>;
}

export default async function Home() {
  const [reitData, bondData] = await Promise.all([getReits(), getBonds()]);
  const reits = reitData?.reits || [];
  const bonds = bondData?.bonds || [];
  const sectors = Array.from(new Set(reits.map((r) => r.sector).filter(Boolean))) as string[];

  return (
    <main>
      <section className="hero">
        <h1>상장리츠 인사이트</h1>
        <p>한국 상장리츠(REITs)를 핵심지표·배당·포트폴리오·AI 요약으로. 공시·발행 채권까지 연결.</p>
      </section>

      <h2 className="sec">상장리츠 <Link style={{ fontSize: 13, fontWeight: 400 }} href="/reits">전체 보기 →</Link></h2>
      <div className="chips">
        <Link className="chip" href="/reits">전체</Link>
        {sectors.map((s) => (
          <Link key={s} className="chip" href={`/reits?sector=${encodeURIComponent(s)}`}>{s}</Link>
        ))}
      </div>

      <div className="ad">광고 영역 (운영 시 AdSense)</div>

      {reits.length === 0 ? (
        <div className="empty">데이터가 없거나 API에 연결할 수 없습니다. backend 를 실행하고 <code>load.py</code> 로 데이터를 넣어주세요.</div>
      ) : (
        <div className="card">
          {reits.map((r) => (
            <Link key={r.ticker} className="row" href={`/reit/${r.ticker}`}>
              <div className="t">{r.name} <span className="tag">{r.sector}</span></div>
              <div className="m">{r.ticker} · 배당수익률 {r.dividend_yield}% · {r.dividend_freq} 배당 · NAV {r.nav_ratio}</div>
            </Link>
          ))}
        </div>
      )}

      <div className="grid2">
        <div>
          <h2 className="sec">리츠 발행 채권 <Link style={{ fontSize: 12, fontWeight: 400 }} href="/bonds">전체 →</Link></h2>
          <div className="card">
            {bonds.slice(0, 6).map((b) => (
              <Link key={b.isin} className="row" href={`/bond/${b.isin}`}>
                <div className="t">{b.bond_name} {ratingBadge(b.credit_rating)}</div>
                <div className="m">{b.issuer} · 표면 {b.coupon_rate} · 만기 {b.maturity_date}</div>
              </Link>
            ))}
            {bonds.length === 0 && <div className="row"><div className="m">데이터 없음</div></div>}
          </div>
        </div>
        <div>
          <h2 className="sec">공시 검색 (DART)</h2>
          <div className="card">
            <div className="row">
              <div className="t">키워드로 사업보고서 문단 검색</div>
              <div className="m">상단 검색창 또는 예: <Link href="/search?q=배당">배당</Link> · <Link href="/search?q=우발부채">우발부채</Link></div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
