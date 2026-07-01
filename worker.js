// 모델터 워커 — 익명 사용 이벤트 수집(/e) + 정적 에셋 서빙
// 입력 숫자·렌트롤 내용·개인정보는 절대 저장하지 않음. 이벤트명/딜유형/기기/유입호스트만.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/e" && request.method === "POST") {
      try {
        const d = await request.json();
        const s = (v, n) => String(v == null ? "" : v).slice(0, n);
        const ev = s(d.t, 32);
        if (ev && env.AE) {
          const ua = request.headers.get("user-agent") || "";
          const dev = /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? "mobile" : "desktop";
          let refHost = "";
          const ref = request.headers.get("referer");
          if (ref) { try { refHost = new URL(ref).hostname.slice(0, 40); } catch (_) {} }
          const cc = (request.cf && request.cf.country) || "";
          env.AE.writeDataPoint({
            indexes: [ev],
            blobs: [ev, s(d.deal, 16), s(d.depth, 12), dev, refHost, s(cc, 4)],
            doubles: [d.rr ? 1 : 0],
          });
        }
      } catch (_) { /* 조용히 무시 — 로깅 실패가 사용자 경험을 막지 않도록 */ }
      return new Response(null, { status: 204 });
    }

    // 그 외 모든 요청은 정적 에셋으로 (index.html·og.png·_headers 등)
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
  },
};
