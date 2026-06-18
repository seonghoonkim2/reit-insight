import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getReit, jsonLd, payMonths, SITE_URL } from "@/lib/api";
import { sectorInfo } from "@/lib/sectors";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: { ticker: string } }): Promise<Metadata> {
  const r = await getReit(params.ticker);
  if (!r) return { title: "리츠" };
  return {
    title: `${r.name} (${r.ticker}) — 배당·NAV·포트폴리오`,
    description: `${r.name}의 배당수익률·NAV·보유자산·신용등급과 AI 요약, 발행 채권 정보.`,
    alternates: { canonical: `${SITE_URL}/reit/${params.ticker}` },
  };
}

const Row = ({ k, v }: { k: string; v?: string }) =>
  v ? (<tr><th>{k}</th><td>{v}</td></tr>) : null;

export default async function ReitPage({ params }: { params: { ticker: string } }) {
  const r = await getReit(params.ticker);
  if (!r) notFound();

  const ld = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: r.name,
    tickerSymbol: r.ticker,
    url: `${SITE_URL}/reit/${r.ticker}`,
    ...(r.homepage ? { sameAs: [r.homepage] } : {}),
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(ld)} />
      <div className="crumb"><Link href="/">홈</Link> › <Link href="/reits">상장리츠</Link> › {r.sector}</div>
      <h1 className="page">
        {r.name} <span className="tag">{r.sector}</span>
        {r.credit_rating && <span className="badge latest">{r.credit_rating}</span>}
      </h1>
      <div className="kv">
        종목코드 {r.ticker}{r.market ? ` · ${r.market}` : ""}
        {r.homepage && <> · <a href={r.homepage} target="_blank" rel="noopener noreferrer">홈페이지 ↗</a></>}
      </div>

      <h2 className="sec">핵심 지표 <span style={{ fontSize: 12, color: "var(--muted)" }}>(숫자는 예시)</span></h2>
      <div className="vbox">
        <table className="kvt"><tbody>
          <Row k="주가" v={r.price} /><Row k="시가총액" v={r.market_cap} />
          <Row k="52주 최고" v={r.week52_high} /><Row k="52주 최저" v={r.week52_low} />
          <Row k="배당수익률" v={r.dividend_yield ? `${r.dividend_yield}%` : undefined} />
          <Row k="배당주기" v={r.dividend_freq} />
          <Row k="예상 배당월" v={payMonths(r).map((m) => `${m}월`).join(" · ") || undefined} />
          <Row k="주가/NAV" v={r.nav_ratio} />
          <Row k="신용등급" v={r.credit_rating} />
          <Row k="상장일" v={r.listing_date} />
          <Row k="자산관리회사(AMC)" v={r.amc} />
        </tbody></table>
      </div>

      <div className="vadd">
        <div className="vbox"><h3>🤖 AI 요약 (참고)</h3><p>{r.summary || "준비 중"}</p></div>
        <div className="vbox">
          <h3>📌 핵심 포인트</h3>
          {r.key_points && r.key_points.length ? (
            <ul className="points">{r.key_points.map((p, i) => <li key={i}>{p}</li>)}</ul>
          ) : <p>준비 중</p>}
        </div>
      </div>

      {sectorInfo(r.sector) && (
        <div className="vbox" style={{ marginTop: 12 }}>
          <h3 style={{ margin: "0 0 6px" }}>📚 {r.sector} 리츠란? <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}>(섹터 일반 설명)</span></h3>
          <p style={{ margin: 0 }}>{sectorInfo(r.sector)}</p>
        </div>
      )}

      <div className="ad">광고 영역 (운영 시 AdSense)</div>

      {r.portfolio && r.portfolio.length > 0 && (
        <>
          <h2 className="sec">주요 보유자산</h2>
          <div className="card">{r.portfolio.map((p, i) => <div key={i} className="row"><div className="t">{p}</div></div>)}</div>
        </>
      )}

      {r.bonds && r.bonds.length > 0 && (
        <>
          <h2 className="sec">이 리츠가 발행한 채권</h2>
          <div className="card">
            {r.bonds.map((b) => (
              <Link key={b.isin} className="row" href={`/bond/${b.isin}`}>
                <div className="t">{b.bond_name} {b.credit_rating && <span className="badge latest">{b.credit_rating}</span>}</div>
                <div className="m">표면 {b.coupon_rate} · 만기 {b.maturity_date}</div>
              </Link>
            ))}
          </div>
        </>
      )}

      <h2 className="sec">관련 공시(DART)</h2>
      <div className="card">
        <Link className="row" href={`/search?q=${encodeURIComponent(r.name)}`}>
          <div className="t">&quot;{r.name}&quot; 사업보고서 문단 검색 →</div>
          <div className="m">공시 전문검색으로 연결</div>
        </Link>
      </div>
    </main>
  );
}
