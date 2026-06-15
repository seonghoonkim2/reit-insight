import type { MetadataRoute } from "next";
import { getCompanies, getCompany, POPULAR, SITE_URL } from "@/lib/api";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const urls: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now },
  ];

  for (const k of POPULAR) {
    urls.push({ url: `${SITE_URL}/topic/${encodeURIComponent(k)}`, lastModified: now });
  }

  const data = await getCompanies();
  for (const c of data?.companies || []) {
    urls.push({ url: `${SITE_URL}/company/${c.corp_code}`, lastModified: now });
    const co = await getCompany(c.corp_code);
    for (const f of co?.filings || []) {
      if (f.is_latest_version !== false) {
        urls.push({ url: `${SITE_URL}/filing/${f.rcept_no}`, lastModified: now });
      }
    }
  }
  return urls;
}
