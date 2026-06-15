import type { Company, FilingMeta, Section, SearchHit, Version, DiffResult } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

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
  opts: { year?: string; corp_code?: string; limit?: number } = {}
): Promise<{ query: string; count: number; results: SearchHit[] } | null> {
  const p = new URLSearchParams({ q });
  if (opts.year) p.set("year", opts.year);
  if (opts.corp_code) p.set("corp_code", opts.corp_code);
  if (opts.limit) p.set("limit", String(opts.limit));
  return apiGet(`/api/v1/search?${p.toString()}`);
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
