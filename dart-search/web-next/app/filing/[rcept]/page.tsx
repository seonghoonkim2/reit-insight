import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFiling, jsonLd, SITE_URL } from "@/lib/api";

export const revalidate = 300;

function isoDate(d: string) {
  return d && d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : undefined;
}

export async function generateMetadata({ params }: { params: { rcept: string } }): Promise<Metadata> {
  const data = await getFiling(params.rcept);
  if (!data) return { title: "보고서" };
  const f = data.filing;
  return {
    title: `${f.corp_name} ${f.business_year} 사업보고서`,
    description: `${f.corp_name} ${f.business_year} 사업보고서 전문 · 섹션별 원문과 요약, DART 원문 링크.`,
    alternates: { canonical: `${SITE_URL}/filing/${params.rcept}` },
    openGraph: { type: "article" },
  };
}

export default async function FilingPage({ params }: { params: { rcept: string } }) {
  const data = await getFiling(params.rcept);
  if (!data) notFound();
  const { filing: f, sections } = data;

  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${f.corp_name} ${f.business_year} 사업보고서`,
    inLanguage: "ko",
    ...(isoDate(f.rcept_dt) ? { datePublished: isoDate(f.rcept_dt) } : {}),
    author: { "@type": "Organization", name: f.corp_name },
    publisher: { "@type": "Organization", name: "공시렌즈" },
    mainEntityOfPage: `${SITE_URL}/filing/${params.rcept}`,
  };

  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(ld)} />
      <div className="crumb">
        <Link href="/">홈</Link> › <Link href={`/company/${f.corp_code}`}>{f.corp_name}</Link> › 보고서
      </div>
      <h1 className="page">
        {f.corp_name} {f.business_year} 사업보고서
        {f.is_latest_version && <span className="badge latest">최신본</span>}
        {f.is_amended && <span className="badge amend">{f.amendment_type || "정정"}</span>}
      </h1>
      <div className="kv">
        접수일 {f.rcept_dt} · 접수번호 {f.rcept_no} ·{" "}
        <a href={f.dart_viewer_url || "#"} target="_blank" rel="noopener noreferrer nofollow">DART 원문 보기 ↗</a>
      </div>

      <div className="ad">광고 영역 (운영 시 AdSense)</div>

      {sections.map((s) => (
        <div className="section" key={s.section_order}>
          <h3>{s.section_title}</h3>
          {s.section_path && s.section_path !== s.section_title && (
            <div className="spath">{s.section_path}</div>
          )}
          <div className="body">{s.clean_text}</div>
        </div>
      ))}
    </main>
  );
}
