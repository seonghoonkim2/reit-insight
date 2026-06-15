import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCompany, jsonLd, SITE_URL, POPULAR } from "@/lib/api";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const data = await getCompany(params.code);
  if (!data) return { title: "회사" };
  const name = data.company.corp_name;
  return {
    title: `${name} 사업보고서`,
    description: `${name}의 DART 사업보고서를 연도별로 검색·비교.`,
    alternates: { canonical: `${SITE_URL}/company/${params.code}` },
  };
}

export default async function CompanyPage({ params }: { params: { code: string } }) {
  const data = await getCompany(params.code);
  if (!data) notFound();
  const { company, filings } = data;

  const ld = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: company.corp_name,
    ...(company.stock_code ? { tickerSymbol: company.stock_code } : {}),
    url: `${SITE_URL}/company/${params.code}`,
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(ld)} />
      <div className="crumb"><Link href="/">홈</Link> › 회사</div>
      <h1 className="page">{company.corp_name}</h1>
      <div className="kv">
        종목코드 {company.stock_code || "-"}
        {company.market ? ` · ${company.market}` : ""} · 사업보고서 {filings.length}건
      </div>

      <h2 className="sec">이 회사에서 빠른 검색</h2>
      <div className="chips">
        {POPULAR.slice(0, 6).map((k) => (
          <Link key={k} className="chip" href={`/search?q=${encodeURIComponent(k)}&corp_code=${company.corp_code}`}>{k}</Link>
        ))}
      </div>

      <h2 className="sec">연도별 사업보고서</h2>
      <div className="card">
        {filings.map((f) => (
          <Link key={f.rcept_no} className="row" href={`/filing/${f.rcept_no}`}>
            <div className="t">
              {f.business_year} 사업보고서
              {f.is_latest_version && <span className="badge latest">최신본</span>}
              {f.is_amended && <span className="badge amend">{f.amendment_type || "정정"}</span>}
            </div>
            <div className="m">접수일 {f.rcept_dt}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
