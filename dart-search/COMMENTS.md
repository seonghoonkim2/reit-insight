# 리츠별 공유 댓글 켜기 (Supabase)

기본값은 **이 브라우저에만 저장되는 데모 댓글**(localStorage)입니다.
아래처럼 **Supabase**(무료 플랜 가능)를 연결하면 **사용자 간 공유 댓글**이 됩니다.
코드 수정은 값 2개만 넣으면 됩니다.

## 1) Supabase 프로젝트 만들기
1. https://supabase.com 가입 → **New project** 생성(무료).
2. 프로젝트의 **Project URL** 과 **anon public key** 를 메모해 둡니다.
   - Settings → API → `Project URL`, `Project API keys > anon public`
   - ⚠️ `anon` 키는 **공개키**라 프런트엔드에 노출돼도 됩니다(아래 RLS 로 보호). `service_role` 키는 절대 넣지 마세요.

## 2) 댓글 테이블 + 보안정책(RLS) 만들기
Supabase 대시보드 → **SQL Editor** 에 아래를 붙여 실행하세요.

```sql
create table if not exists public.comments (
  id          bigint generated always as identity primary key,
  reit_ticker text not null,
  nickname    text,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_comments_ticker_time
  on public.comments (reit_ticker, created_at desc);

alter table public.comments enable row level security;

-- 누구나 읽기 허용
create policy "comments_read" on public.comments
  for select using (true);

-- 누구나 작성 허용(길이 제한). 운영 시 더 강하게 제한 권장.
create policy "comments_insert" on public.comments
  for insert with check (
    char_length(body) between 1 and 500
    and char_length(coalesce(nickname, '')) <= 20
  );
```

> 수정/삭제 정책은 두지 않았으므로 기본적으로 **수정·삭제 불가**(append-only)입니다.
> 신고/삭제가 필요하면 관리자가 대시보드에서 직접 지우거나, 별도 정책을 추가하세요.

## 3) 사이트에 값 넣기
`dart-search/web/index.html` 에서 아래 두 줄을 채웁니다.

```js
var SUPABASE_URL = "https://xxxx.supabase.co"; // Project URL
var SUPABASE_ANON_KEY = "eyJhbGciOi...";        // anon public key
```

저장 후 리츠 상세 페이지의 **💬 투자자 댓글** 영역이 "공유" 모드로 바뀌고,
모든 방문자가 같은 댓글을 보고 작성할 수 있습니다.

## 4) (선택) 스팸·악용 대비
- Supabase **Rate limiting**, **Captcha(Cloudflare Turnstile)** 연동을 고려하세요.
- 욕설/광고 필터가 필요하면 작성 정책(`with check`)에 조건을 추가하거나,
  Edge Function 으로 검증 후 insert 하도록 바꿀 수 있습니다.
- 개인정보·투자 권유·비방 글 금지 안내는 입력창 아래에 이미 표시됩니다.

## 동작 방식(요약)
- 읽기: `GET {URL}/rest/v1/comments?reit_ticker=eq.<코드>&order=created_at.desc`
- 쓰기: `POST {URL}/rest/v1/comments` (body: `{reit_ticker, nickname, body}`)
- 헤더: `apikey`, `Authorization: Bearer <anon key>`
- 별도 SDK 없이 **fetch** 만 사용하므로 정적 사이트(GitHub Pages)에서도 그대로 동작합니다.
