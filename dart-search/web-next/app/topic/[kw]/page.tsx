import Link from "next/link";
import type { Metadata } from "next";
import { search, SITE_URL } from "@/lib/api";

export const revalidate = 300;

export function generateMetadata({ params }: { params: { kw: string } }): Metadata {
  const kw = decodeURIComponent(params.kw);
  return {
    title: `${kw} 사업보고서`,
    description: `'${kw}'가 언급된 DART 사업보고서를 회사별 빈도와 함께 정리.`,
    alternates: { canonical: `${SITE_URL}/topic/${params.kw}` },
  };
}

export default async function TopicPage({ params }: { params: { kw: string } }) {
  const kw = decodeURIComponent(params.kw);
  const data = await search(kw, { limit: 100 });
  const hits = data?.results || [];

  const byCo: Record<string, { name: string; code: string; n: number }> = {};
  const fil = new Set<string>();
  for (const h of hits) {
    byCo[h.corp_code] = byCo[h.corp_code] || { name: h.corp_name, code: h.corp_code, n: 0 };
    byCo[h.corp_code].n++;
    fil.add(h.rcept_no);
  }
  const coList = Object.values(byCo).sort((a, b) => b.n - a.n);

  return (
    <main>
      <div className="crumb"><Link href="/">홈</Link> › 키워드</div>
      <h1 className="page">&quot;{kw}&quot;가 언급된 사업보고서</h1>
      <div className="stat">총 <b>{fil.size}</b>개 보고서 · <b>{coList.length}</b>개 회사 · <b>{hits.length}</b>개 문단</div>

      {hits.length === 0 ? (
        <div className="empty">
          언급을 찾지 못했습니다. <Link href={`/search?q=${encodeURIComponent(kw)}`}>일반 검색 →</Link>
        </div>
      ) : (
        <>
          <div className="ad">광고 영역 (운영 시 AdSense)</div>
          <h2 className="sec">상위 언급 기업</h2>
          <div className="card">
            {coList.slice(0, 15).map((co, i) => (
              <Link key={co.code} className="row" href={`/search?q=${encodeURIComponent(kw)}&corp_code=${co.code}`}>
                <div className="t">{i + 1}. {co.name}</div>
                <div className="m">{co.n}회 언급</div>
              </Link>
            ))}
          </div>

          <h2 className="sec">관련 문단</h2>
          {hits.slice(0, 30).map((h, i) => (
            <div className="res" key={`${h.rcept_no}-${i}`}>
              <div>
                <Link className="co" href={`/company/${h.corp_code}`}>{h.corp_name}</Link>{" "}
                <span className="tag">{h.year}</span>
              </div>
              <div className="path">{h.section_title}</div>
              <div className="snip" dangerouslySetInnerHTML={{ __html: h.snippet }} />
              <div className="act"><Link href={`/filing/${h.rcept_no}`}>보고서에서 보기 →</Link></div>
            </div>
          ))}
        </>
      )}
    </main>
  );
}
