import Link from "next/link";
import type { Metadata } from "next";
import { getDiff } from "@/lib/api";

export const revalidate = 300;
export const metadata: Metadata = { title: "정정 전후 비교", robots: { index: false } };

type SP = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function DiffPage({ searchParams }: { searchParams: SP }) {
  const a = one(searchParams.a);
  const b = one(searchParams.b);
  const data = a && b ? await getDiff(a, b) : null;

  if (!data) {
    return (
      <main>
        <div className="crumb"><Link href="/">홈</Link> › 비교</div>
        <div className="empty">비교할 보고서를 찾을 수 없습니다. (a, b 접수번호 필요)</div>
      </main>
    );
  }

  const { a_meta, b_meta, diff } = data;
  return (
    <main>
      <div className="crumb">
        <Link href="/">홈</Link> ›{" "}
        <Link href={`/company/${a_meta.corp_code}`}>{a_meta.corp_name}</Link> › 정정 전후 비교
      </div>
      <h1 className="page">{a_meta.corp_name} 정정 전후 비교</h1>
      <div className="kv">
        새 버전 {a_meta.rcept_dt}({a_meta.report_nm}) ← 이전 {b_meta.rcept_dt}({b_meta.report_nm})
      </div>

      <div className="vbox">
        {diff.new_sections.length > 0 && (
          <p>🆕 새로 등장한 섹션: {diff.new_sections.join(", ")}</p>
        )}
        {diff.removed_sections.length > 0 && (
          <p>➖ 사라진 섹션: {diff.removed_sections.join(", ")}</p>
        )}

        <h2 className="sec">변경된 섹션</h2>
        {diff.changed_sections.length === 0 ? (
          <p className="kv">본문 변경이 감지되지 않았습니다.</p>
        ) : (
          diff.changed_sections.map((c) => (
            <div className="row" key={c.title}>
              <div className="t">{c.title}</div>
              <div className="m">변경률 {c.change_pct}%</div>
            </div>
          ))
        )}

        <h2 className="sec">키워드 증감</h2>
        {diff.keyword_delta.filter((k) => k.delta !== 0).length === 0 ? (
          <p className="kv">키워드 변동이 없습니다.</p>
        ) : (
          <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr><th style={{ textAlign: "left", paddingRight: 12 }}>키워드</th><th>이전</th><th>이후</th><th>증감</th></tr>
            </thead>
            <tbody>
              {diff.keyword_delta.map((k) => (
                <tr key={k.keyword}>
                  <td style={{ textAlign: "left", paddingRight: 12 }}>{k.keyword}</td>
                  <td style={{ textAlign: "right" }}>{k.before}</td>
                  <td style={{ textAlign: "right" }}>{k.after}</td>
                  <td style={{ textAlign: "right" }}>{k.delta > 0 ? `+${k.delta}` : k.delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p>
        <Link href={`/filing/${a_meta.rcept_no}`}>← 새 버전 보고서</Link> ·{" "}
        <Link href={`/filing/${b_meta.rcept_no}`}>이전 버전 보고서 →</Link>
      </p>
    </main>
  );
}
