// 모델터 워커 — 익명 사용 이벤트 수집(/e) + 정적 에셋 서빙
// 입력 숫자·렌트롤 내용·개인정보는 절대 저장하지 않음. 이벤트명/딜유형/기기/유입호스트만.
// 저장: Workers Logs(console.log, 대시보드에서 조회). env.AE 바인딩이 있으면 Analytics Engine에도 기록.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/e" && request.method === "POST") {
      try {
        const d = await request.json();
        const s = (v, n) => String(v == null ? "" : v).slice(0, n);
        const ev = s(d.t, 32);
        if (ev) {
          const ua = request.headers.get("user-agent") || "";
          const dev = /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? "mobile" : "desktop";
          let refHost = "";
          const ref = request.headers.get("referer");
          if (ref) { try { refHost = new URL(ref).hostname.slice(0, 40); } catch (_) {} }
          const cc = (request.cf && request.cf.country) || "";
          const rec = { ev, deal: s(d.deal, 16), depth: s(d.depth, 12), rr: d.rr ? 1 : 0, dev, ref: refHost, cc };
          // Workers Logs 로 남김 (대시보드 → Workers → Logs 에서 조회)
          console.log("mtevent " + JSON.stringify(rec));
          // Analytics Engine 바인딩이 있으면 집계 저장소에도 기록 (선택)
          if (env.AE) {
            env.AE.writeDataPoint({
              indexes: [ev],
              blobs: [ev, rec.deal, rec.depth, dev, refHost, s(cc, 4)],
              doubles: [rec.rr],
            });
          }
        }
      } catch (_) { /* 로깅 실패가 사용자 경험을 막지 않도록 조용히 무시 */ }
      return new Response(null, { status: 204 });
    }

    // 그 외 모든 요청은 정적 에셋으로 (index.html·og.png·_headers 등)
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
  },
};
