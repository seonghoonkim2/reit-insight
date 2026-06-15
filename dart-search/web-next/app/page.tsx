import Link from "next/link";
import { getCompanies, POPULAR } from "@/lib/api";

export const revalidate = 300;

export default async function Home() {
  const data = await getCompanies();
  const companies = data?.companies || [];

  return (
    <main>
      <section className="hero">
        <h1>기업 사업보고서 전문 검색</h1>
        <p>DART 사업보고서를 회사별·연도별·섹션별로 빠르게 찾으세요.</p>
      </section>

      <h2 className="sec">인기 검색어</h2>
      <div className="chips">
        {POPULAR.map((k) => (
          <Link key={k} className="chip" href={`/topic/${encodeURIComponent(k)}`}>{k}</Link>
        ))}
      </div>

      <div className="ad">광고 영역 (운영 시 AdSense)</div>

      <h2 className="sec">회사</h2>
      {companies.length === 0 ? (
        <div className="empty">
          데이터가 없거나 백엔드 API에 연결할 수 없습니다.<br />
          backend 를 실행하고 <code>load.py</code> 로 데이터를 넣어주세요.
        </div>
      ) : (
        <div className="card">
          {companies.map((c) => (
            <Link key={c.corp_code} className="row" href={`/company/${c.corp_code}`}>
              <div className="t">{c.corp_name}</div>
              <div className="m">{c.stock_code || "-"}{c.market ? ` · ${c.market}` : ""}</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
