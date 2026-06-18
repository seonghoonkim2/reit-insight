import Link from "next/link";
import type { Metadata } from "next";
import { getReits, payMonths, SITE_URL } from "@/lib/api";
import type { Reit } from "@/lib/types";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "배당 캘린더",
  description: "상장리츠 배당 지급(예상)월을 월별로 정리한 배당 캘린더. 결산월 기준 추정치.",
  alternates: { canonical: `${SITE_URL}/calendar` },
};

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default async function CalendarPage() {
  const reits = ((await getReits())?.reits || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const curM = new Date().getMonth() + 1;

  const byMonth: Record<number, Reit[]> = {};
  MONTHS.forEach((m) => (byMonth[m] = []));
  reits.forEach((r) => payMonths(r).forEach((m) => byMonth[m] && byMonth[m].push(r)));

  const thisList = byMonth[curM] || [];
  let nextM = 0;
  let nextList: Reit[] = [];
  for (let step = 1; step <= 12; step++) {
    const mm = ((curM - 1 + step) % 12) + 1;
    if (byMonth[mm] && byMonth[mm].length) { nextM = mm; nextList = byMonth[mm]; break; }
  }
  const chips = (list: Reit[]) =>
    list.length ? (
      <div className="chips">{list.map((r) => <Link key={r.ticker} className="chip" href={`/reit/${r.ticker}`}>{r.name}</Link>)}</div>
    ) : (
      <p className="kv">예상 리츠 없음</p>
    );

  return (
    <main>
      <div className="crumb"><Link href="/">홈</Link> › 배당 캘린더</div>
      <h1 className="page">배당 캘린더 <span style={{ fontSize: 12, color: "var(--muted)" }}>(결산월 기준 예상 지급월)</span></h1>
      <p className="kv">상장리츠의 배당 지급 시기를 월별로 모았습니다. ●는 그 달에 배당이 예상되는 리츠이며, <b>실제 분배락·지급일·금액은 각 리츠 공시로 확인</b>하세요.</p>

      {reits.length === 0 ? (
        <div className="empty">데이터가 없거나 API에 연결할 수 없습니다.</div>
      ) : (
        <>
          <div className="vadd">
            <div className="vbox"><h3>📅 이번 달({curM}월) 배당 예상</h3>{chips(thisList)}</div>
            <div className="vbox"><h3>⏭️ 다음 배당 달{nextM ? `(${nextM}월)` : ""}</h3>{chips(nextList)}</div>
          </div>

          <div className="ad">광고 영역 (운영 시 AdSense)</div>

          <h2 className="sec">리츠별 배당월</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="kvt" style={{ minWidth: 780 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>리츠</th><th>주기</th>
                  {MONTHS.map((m) => <th key={m} style={m === curM ? { color: "var(--accent)" } : undefined}>{m}</th>)}
                </tr>
              </thead>
              <tbody>
                {reits.map((r) => {
                  const pm = new Set(payMonths(r));
                  return (
                    <tr key={r.ticker}>
                      <td style={{ textAlign: "left" }}><Link href={`/reit/${r.ticker}`}>{r.name}</Link></td>
                      <td>{r.dividend_freq || "-"}</td>
                      {MONTHS.map((m) => (
                        <td key={m} style={m === curM ? { background: "#f3f4f6" } : undefined}>
                          {pm.has(m) ? <span style={{ color: "var(--accent)", fontWeight: 700 }}>●</span> : <span style={{ color: "var(--border)" }}>·</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h2 className="sec">월별 배당 리츠</h2>
          <div className="card">
            {MONTHS.map((m) => (
              <div key={m} className="row">
                <div className="t">{m}월{m === curM && <span className="tag">이번 달</span>}</div>
                <div className="m">
                  {byMonth[m].length
                    ? byMonth[m].map((r, i) => (
                        <span key={r.ticker}>{i > 0 ? " · " : ""}<Link href={`/reit/${r.ticker}`}>{r.name}</Link></span>
                      ))
                    : "예상 배당 없음"}
                </div>
              </div>
            ))}
          </div>
          <p className="kv">결산월 기준 추정 지급월입니다. 분배락·실제 지급일은 각 리츠 IR/공시를 확인하세요. 투자 권유가 아닙니다.</p>
        </>
      )}
    </main>
  );
}
