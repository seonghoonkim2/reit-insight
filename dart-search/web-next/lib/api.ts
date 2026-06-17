import type { Company, FilingMeta, Section, SearchHit, Version, DiffResult } from "./types";

// 서버 컴포넌트는 런타임 env(API_BASE)를, 클라이언트는 빌드시 NEXT_PUBLIC_* 를 사용.
const BASE = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
// 브라우저에서 직접 접근할 백엔드 주소(CSV 다운로드 링크 등). 빌드시 인라인.
export const PUBLIC_API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
export const SITE_URL =
  process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function search(
  q: string,
  opts: { year?: string; corp_code?: string; sort?: string; limit?: number } = {}
): Promise<{ query: string; count: number; results: SearchHit[] } | null> {
  return apiGet(`/api/v1/search?${searchParams(q, opts).toString()}`);
}

function searchParams(q: string, opts: { year?: string; corp_code?: string; sort?: string; limit?: number }) {
  const p = new URLSearchParams({ q });
  if (opts.year) p.set("year", opts.year);
  if (opts.corp_code) p.set("corp_code", opts.corp_code);
  if (opts.sort && opts.sort !== "relevance") p.set("sort", opts.sort);
  if (opts.limit) p.set("limit", String(opts.limit));
  return p;
}

export function csvUrl(q: string, opts: { year?: string; corp_code?: string; sort?: string } = {}) {
  return `${PUBLIC_API_BASE}/api/v1/search.csv?${searchParams(q, opts).toString()}`;
}

export function getCompanies(): Promise<{ count: number; companies: Company[] } | null> {
  return apiGet(`/api/v1/companies`);
}

export function getCompany(
  code: string
): Promise<{ company: Company; filings: FilingMeta[] } | null> {
  return apiGet(`/api/v1/company/${encodeURIComponent(code)}`);
}

export function getFiling(
  rcept: string
): Promise<{ filing: FilingMeta; sections: Section[]; financial_facts: any[] } | null> {
  return apiGet(`/api/v1/filings/${encodeURIComponent(rcept)}`);
}

export function getGroup(
  key: string
): Promise<{ filing_group_key: string; count: number; versions: Version[] } | null> {
  return apiGet(`/api/v1/group/${encodeURIComponent(key)}`);
}

export function getDiff(
  a: string,
  b: string
): Promise<{ a: string; b: string; a_meta: FilingMeta; b_meta: FilingMeta; diff: DiffResult } | null> {
  return apiGet(`/api/v1/diff?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`);
}

export const POPULAR = [
  "우발부채", "PF", "배당정책", "재고자산", "계속기업 불확실성",
  "소송", "특수관계자 거래", "영업권 손상", "책임준공", "미분양",
];

export function jsonLd(obj: unknown) {
  return { __html: JSON.stringify(obj) };
}
