export interface Company {
  corp_code: string;
  corp_name: string;
  stock_code?: string | null;
  market?: string | null;
}

export interface FilingMeta {
  rcept_no: string;
  corp_code: string;
  corp_name: string;
  report_nm: string;
  business_year: number;
  rcept_dt: string;
  is_amended?: boolean;
  amendment_type?: string | null;
  is_latest_version?: boolean;
  filing_group_key?: string;
  dart_viewer_url?: string;
}

export interface Version {
  rcept_no: string;
  report_nm: string;
  rcept_dt: string;
  is_amended?: boolean;
  amendment_type?: string | null;
  is_latest_version?: boolean;
}

export interface Reit {
  ticker: string;
  name: string;
  sector?: string;
  market?: string;
  price?: string;
  market_cap?: string;
  dividend_yield?: string;
  dividend_freq?: string;
  nav_ratio?: string;
  amc?: string;
  listing_date?: string;
  credit_rating?: string;
  portfolio?: string[];
  summary?: string;
  key_points?: string[];
  corp_code?: string;
  homepage?: string;
  pay_months?: number[];
  week52_high?: string;
  week52_low?: string;
  bonds?: Bond[];
}

export interface Bond {
  isin: string;
  bond_name: string;
  issuer?: string;
  issuer_code?: string;
  bond_type?: string;
  coupon_rate?: string;
  interest_type?: string;
  coupon_freq?: string;
  issue_date?: string;
  maturity_date?: string;
  issue_amount?: string;
  outstanding?: string;
  seniority?: string;
  guaranteed?: string;
  credit_rating?: string;
  listed?: string;
  summary?: string;
  key_points?: string[];
  source_url?: string;
}

export interface DiffResult {
  new_sections: string[];
  removed_sections: string[];
  changed_sections: { title: string; similarity: number; change_pct: number }[];
  keyword_delta: { keyword: string; before: number; after: number; delta: number }[];
}

export interface Section {
  section_order: number;
  section_path: string;
  section_title: string;
  clean_text: string;
}

export interface SearchHit {
  rcept_no: string;
  corp_code: string;
  corp_name: string;
  year: number;
  report_nm: string;
  rcept_dt: string;
  section_title: string;
  snippet: string;
  engine: string;
}
