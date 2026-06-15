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
