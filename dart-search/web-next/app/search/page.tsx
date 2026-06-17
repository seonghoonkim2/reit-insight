import Link from "next/link";
import type { Metadata } from "next";
import { search, csvUrl } from "@/lib/api";

export const revalidate = 60;

type SP = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export function generateMetadata({ searchParams }: { searchParams: SP }): Metadata {
  const q = one(searchParams.q);
  return { title: q ? `"${q}" 검색` : "검색", robots: q ? undefined : { index: false } };
}

export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const q = one(searchParams.q);
  const year = one(searchParams.year);
  const corp = one(searchParams.corp_code);
  const sort = one(searchParams.sort) || "relevance";
  const data = q ? await search(q, { year, corp_code: corp, sort, limit: 60 }) : { count: 0, results: [] };
  const results = data?.results || [];

  const years = Array.from(new Set(results.map((r) => String(r.year)))).sort();
  const base: Record<string, string> = {
    q, ...(corp ? { corp_code: corp } : {}), ...(year ? { year } : {}), ...(sort !== "relevance" ? { sort } : {}),
  };
  const link = (extra: Record<string, string>) => {
    const merged: Record<string, string> = { ...base, ...extra };
    Object.keys(merged).forEach((k) => merged[k] === "" && delete merged[k]);
    return `/search?${new URLSearchParams(merged).toString()}`;
  };
  const sorts: [string, string][] = [["relevance", "관련도순"], ["recent", "최신순"], ["company", "회사명순"]];

  return (
    <main>
      <div className="crumb"><Link href="/">홈</Link> › 검색</div>
      <h1 className="page">&quot;{q || "전체"}&quot; 검색</h1>
      <div className="stat">총 <b>{results.length}</b>건</div>

      <div className="filters">
        {sorts.map(([v, label]) => (
          <Link key={v} className={sort === v ? "on" : ""} href={link({ sort: v })}>{label}</Link>
        ))}
        {q && <a className="chip" href={csvUrl(q, { year, corp_code: corp, sort })}>📥 CSV</a>}
      </div>

      {years.length > 1 && (
        <div className="filters">
          <Link className={!year ? "on" : ""} href={link({ year: "" })}>전체 연도</Link>
          {years.map((y) => (
            <Link key={y} className={year === y ? "on" : ""} href={link({ year: y })}>{y}</Link>
          ))}
        </div>
      )}

      {results.length > 0 && <div className="ad">광고 영역 (운영 시 AdSense)</div>}

      {results.length === 0 ? (
        <div className="empty">일치하는 결과가 없습니다.</div>
      ) : (
        results.map((r, i) => (
          <div className="res" key={`${r.rcept_no}-${i}`}>
            <div>
              <Link className="co" href={`/company/${r.corp_code}`}>{r.corp_name}</Link>{" "}
              <span className="tag">{r.year}</span>
            </div>
            <div className="path">{r.report_nm} · {r.section_title}</div>
            <div className="snip" dangerouslySetInnerHTML={{ __html: r.snippet }} />
            <div className="act">
              <Link href={`/filing/${r.rcept_no}`}>보고서에서 보기 →</Link>
            </div>
          </div>
        ))
      )}
    </main>
  );
}
