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
  dart_viewer_url?: string;
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
