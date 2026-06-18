"use client";

import { useState } from "react";

const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

export default function Calculator() {
  const [amt, setAmt] = useState(10000000);
  const [y, setY] = useState(6.5);
  const [tax, setTax] = useState(15.4);

  const gross = amt * (y / 100);
  const taxAmt = gross * (tax / 100);
  const net = gross - taxAmt;
  const inputStyle = { padding: 6, border: "1px solid var(--border)", borderRadius: 6, width: 160 } as const;

  return (
    <div className="vbox" style={{ maxWidth: 520 }}>
      <table className="kvt"><tbody>
        <tr><th>투자금액(원)</th><td><input type="number" value={amt} onChange={(e) => setAmt(+e.target.value)} style={inputStyle} /></td></tr>
        <tr><th>연 배당수익률(%)</th><td><input type="number" step="0.1" value={y} onChange={(e) => setY(+e.target.value)} style={{ ...inputStyle, width: 120 }} /></td></tr>
        <tr><th>배당소득세율(%)</th><td><input type="number" step="0.1" value={tax} onChange={(e) => setTax(+e.target.value)} style={{ ...inputStyle, width: 120 }} /></td></tr>
      </tbody></table>
      <div style={{ marginTop: 12, fontSize: 14 }}>
        연 세전 배당금: <b>{fmt(gross)}원</b><br />
        세금({tax.toFixed(1)}%): {fmt(taxAmt)}원<br />
        연 <b>세후</b> 배당금: <b style={{ color: "var(--accent)" }}>{fmt(net)}원</b> (월 환산 {fmt(net / 12)}원)<br />
        세후 배당수익률: <b>{((y / 100) * (1 - tax / 100) * 100).toFixed(2)}%</b>
      </div>
      <div className="kv" style={{ marginTop: 8 }}>
        분리과세(15.4%) 가정 단순 계산. 종합과세·건보료 등 미반영. 참고용이며 투자·세무 자문이 아닙니다.
      </div>
    </div>
  );
}
