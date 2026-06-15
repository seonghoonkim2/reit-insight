"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

export default function SearchBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState("");

  useEffect(() => {
    setQ(params.get("q") || "");
  }, [params]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <form className="search" onSubmit={onSubmit}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="회사명·키워드로 검색 (예: 삼성전자 우발부채, PF, 배당)"
        aria-label="검색"
      />
      <button type="submit">검색</button>
    </form>
  );
}
