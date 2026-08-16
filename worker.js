// 모델터 워커 — 익명 사용 이벤트 수집(/e) + 정적 에셋 서빙
// 입력 숫자·렌트롤 내용·개인정보는 절대 저장하지 않음. 이벤트명/딜유형/활성기능 플래그/기기/유입호스트만.
//  · feats = 활성 기능 플래그(rr·dep·fee·bido·vac·resi·hold·pref·scen) — 어떤 선택기능이 실제로 쓰이는지(수치 없음)
// 저장: Workers Logs(console.log, 대시보드에서 조회). env.AE 바인딩이 있으면 Analytics Engine에도 기록.
const SRC_CHANNELS = new Set(["xlsx", "ppt", "png", "qr", "share", "notes", "team", "hero", "pdf", "sns", "seo", "dscr", "imcheck", "howto", "pwa"]);
const EVENT_NAMES = new Set(["activate", "adj_open", "check_open", "ci_probe_live", "cmp_copy", "coach_ok", "compare", "computed", "deal_select", "deal_want", "depth_change", "dev_view", "ex_ack", "example_fill", "fill_std", "first_number_15m", "first_number_30m", "first_number_5m", "first_number_slow", "fsub_open", "handoff_open", "house_apply", "house_set", "house_share", "ic_ppt", "im_checklist", "im_checklist_open", "im_extract", "im_open", "im_quick", "im_quick_open", "inquiry_copy", "landing", "memo_copy", "method", "mydef_apply", "mydef_save", "nudge_save", "pdf_export", "pipeline_copy", "png_card", "prompt_copy", "qr_open", "recover_cta", "rentroll_upload", "rr_mask", "sample_deal", "sample_download", "sample_start", "sens_axis", "session", "share_link", "slot_delete", "slot_save", "solver", "src_tag", "teaser", "term_help", "tip_next", "wizard", "ws_diff", "ws_open", "ws_save", "ws_status", "xlsx_download", "xlsx_restore"]);
const DEAL_NAMES = new Set(["office", "logistics", "dev", "refi", "hotel", "retail", "rental", "datacenter"]);
const DEPTH_NAMES = new Set(["quick", "standard", "deep"]);
const FEAT_NAMES = ["rr", "dep", "fee", "bido", "vac", "resi", "hold", "pref", "scen"];
const AXIS_NAMES = new Set(["growth", "rate", "dev_price", "dev_cost"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Cloudflare는 Worker에 넘기는 URL scheme을 https로 정규화할 수 있어,
    // 원래 방문 scheme이 담긴 CF-Visitor도 함께 본다.
    let cfVisitor = {};
    try { cfVisitor = JSON.parse(request.headers.get("cf-visitor") || "{}"); } catch (_) {}
    // 첫 방문도 항상 암호화된 정식 주소로 보낸다. 경로·쿼리는 유지하고,
    // 308로 GET뿐 아니라 혹시 들어온 POST 메서드도 바꾸지 않는다.
    if (url.protocol === "http:" || cfVisitor.scheme === "http") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 308);
    }

    if (url.pathname === "/e" && request.method === "POST") {
      try {
        const d = await request.json();
        const s = (v, n) => String(v == null ? "" : v).slice(0, n);
        const token = (v, n) => s(v, n).toLowerCase().replace(/[^a-z0-9_]/g, "");
        const evRaw = token(d.t, 32);
        const ev = EVENT_NAMES.has(evRaw) ? evRaw : "";
        if (ev) {
          const ua = request.headers.get("user-agent") || "";
          const dev = /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? "mobile" : "desktop";
          let refHost = "";
          const ref = request.headers.get("referer");
          if (ref) { try { refHost = new URL(ref).hostname.slice(0, 40); } catch (_) {} }
          // 진짜 유입원 우선 — 비콘 referer 헤더는 항상 자기 페이지(자기참조)라, 클라이언트가 진입 시
          // document.referrer에서 뽑아 보낸 외부 호스트명(dr)이 있으면 그것을 ref로 기록(호스트 문자만 허용)
          const dr = s(d.dr, 40).replace(/[^A-Za-z0-9.\-]/g, "");
          if (dr) refHost = dr;
          const cc = (request.cf && request.cf.country) || "";
          const dealRaw = token(d.deal, 16);
          const deal = DEAL_NAMES.has(dealRaw) ? dealRaw : "";
          const depthRaw = token(d.depth, 12);
          const depth = DEPTH_NAMES.has(depthRaw) ? depthRaw : "";
          const featRaw = new Set(s(d.feats, 48).toLowerCase().split(",").map(v => v.replace(/[^a-z0-9_]/g, "")));
          const feats = FEAT_NAMES.filter(v => featRaw.has(v)).join(",");
          const axisRaw = token(d.axis, 12);
          const axis = AXIS_NAMES.has(axisRaw) ? axisRaw : "";
          const featN = feats ? feats.split(",").filter(Boolean).length : 0;
          const srcRaw = token(d.src, 8);
          const src = SRC_CHANNELS.has(srcRaw) ? srcRaw : "";     // 사전 정의 채널만 — 임의 숫자·자유 문자열·PII 없음
          // 봇 판별 — 검색 착지 개설로 JS 실행 크롤러가 방문 분모에 섞이는 것을 태깅(제외는 조회 시).
          //  단어경계 일반어 + 국내외 크롤러 명시 목록 + 클라이언트 webdriver 신호(d.wd). UA 원문은 저장하지 않음.
          //  접미 경계 (…)\b — Googlebot·Bingbot 같은 합성명을 잡되, 실기기 오탐(CUBOT 폰)은 명시 제외
          const BOT_RE = /(bot|spider|crawler|crawling|scraper)\b|headlesschrome|phantomjs|puppeteer|playwright|selenium|slurp|yeti|daumoa|kakaotalk-scrap|kakaostory|facebookexternalhit|whatsapp|telegram|bingpreview|google-inspectiontool|lighthouse|bytespider|petalbot|semrush|ahrefs|mj12|embedly/i;
          const bot = ((BOT_RE.test(ua) && !/cubot/i.test(ua)) || d.wd === 1 || d.wd === true) ? 1 : 0;
          // 실사용 표식(북극성 K3) — 이 세션이 자기 숫자를 직접 입력했는지(activate 발화 후)만. 수치·PII 없음
          const act = (d.act === 1 || d.act === true) ? 1 : 0;
          const rec = { ev, deal, depth, rr: d.rr ? 1 : 0, feats, featN, axis, dev, ref: refHost, cc, src, bot, act };
          // Workers Logs 로 남김 (대시보드 Observability → Query Builder 에서 필드로 필터·그룹 조회)
          //  · 순수 JSON 객체로 로깅해야 Cloudflare가 ev·deal·dev 등을 개별 필드로 파싱함
          //    ("mtevent {json}" 처럼 접두어가 붙으면 파싱이 안 돼 필드 필터가 막힘)
          //  · msg="mtevent" 는 봇 요청 로그와 구분하는 표식 (Filter: msg = mtevent)
          console.log(JSON.stringify({ msg: "mtevent", ...rec }));
          // Analytics Engine 바인딩이 있으면 집계 저장소에도 기록 (선택)
          if (env.AE) {
            env.AE.writeDataPoint({
              indexes: [ev],
              blobs: [ev, rec.deal, rec.depth, dev, refHost, s(cc, 4), feats, axis, src, bot ? "1" : "0", act ? "1" : "0"],  // blob9=src(채널) blob10=bot blob11=act(실사용)
              doubles: [rec.rr, featN],
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
