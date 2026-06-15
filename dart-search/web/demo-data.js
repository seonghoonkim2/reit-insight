// 공시렌즈 데모 샘플 — 인증키 없이 화면 동작을 보여주기 위한 예시입니다.
// ⚠️ 실제 사업보고서가 아니며, 회사명·숫자는 모두 가짜입니다.
//    collect.py / summarize.py 실행 시 data.js 가 생겨 이 데모를 덮어씁니다.
window.__DART_DATA__ = {
  "generated_at": "2026-06-15T00:00:00",
  "is_demo": true,
  "count": 4,
  "reports": [
    {
      "corp_code": "00000001", "corp_name": "샘플전자", "stock_code": "000001", "market": "KOSPI",
      "rcept_no": "20260318000001", "report_nm": "사업보고서 (2025.12)", "report_type": "사업보고서",
      "rcept_dt": "20260318", "year": "2025",
      "filing_group_key": "00000001_사업보고서_2025", "is_latest_version": true,
      "is_amended": false, "amendment_type": null, "version_count": 1,
      "dart_url": "https://dart.fss.or.kr",
      "summary": "(데모) 샘플전자는 반도체·디스플레이·가전을 만드는 가상의 전자기업입니다. 올해는 AI 서버용 메모리 수요가 늘었고, 재고자산 관련 설명이 확대됐습니다. 아래 요약·지표는 summarize.py가 Claude API로 생성한 결과의 예시이며 숫자는 가짜입니다.",
      "key_metrics": {
        "business": "반도체·디스플레이·가전을 만드는 전자기업 (데모)",
        "key_points": ["AI 서버용 메모리(HBM) 수요 회복 언급 증가", "재고자산평가손실 관련 문단 확대", "예시 데이터이므로 투자 판단에 쓰지 마세요"],
        "revenue": "300조원 (예시)", "operating_profit": "40조원 (예시)", "net_profit": "30조원 (예시)"
      },
      "sections": [
        { "title": "I. 회사의 개요", "section_path": "I. 회사의 개요",
          "text": "샘플전자는 데모용 가상의 전자제품 제조 기업입니다. 반도체, 디스플레이, 가전을 주요 사업으로 합니다. 본 자료는 실제 회사가 아닙니다." },
        { "title": "II. 사업의 내용", "section_path": "II. 사업의 내용 > 산업의 특성",
          "text": "주요 사업 부문은 반도체, 디스플레이, 가전입니다. 올해는 AI 서버용 메모리(HBM) 수요가 회복되었다고 가정합니다. 검색창에 '반도체'나 'HBM'을 입력해 보세요." },
        { "title": "III. 재무에 관한 사항", "section_path": "III. 재무에 관한 사항 > 우발부채 및 약정사항",
          "text": "(예시) 매출액 300조원, 영업이익 40조원, 당기순이익 30조원. 우발부채와 관련하여 약정사항이 존재합니다. 재고자산 평가손실 관련 설명을 확대하였습니다. 배당정책은 분기 배당을 유지합니다." }
      ],
      "full_text": "샘플전자 반도체 디스플레이 가전 HBM 우발부채 재고자산 배당정책 매출액 300조원",
      "char_count": 120, "truncated": false
    },
    {
      "corp_code": "00000001", "corp_name": "샘플전자", "stock_code": "000001", "market": "KOSPI",
      "rcept_no": "20250317000001", "report_nm": "사업보고서 (2024.12)", "report_type": "사업보고서",
      "rcept_dt": "20250317", "year": "2024",
      "filing_group_key": "00000001_사업보고서_2024", "is_latest_version": true,
      "is_amended": false, "amendment_type": null, "version_count": 1,
      "dart_url": "https://dart.fss.or.kr",
      "summary": "", "key_metrics": {},
      "sections": [
        { "title": "I. 회사의 개요", "section_path": "I. 회사의 개요",
          "text": "샘플전자 2024년 사업보고서(데모). 전년도와 비교해 회사 페이지의 '연도별 보고서' 동작을 보여주기 위한 예시입니다." },
        { "title": "III. 재무에 관한 사항", "section_path": "III. 재무에 관한 사항 > 우발부채 및 약정사항",
          "text": "(예시) 2024년 매출액 280조원. 우발부채 관련 약정은 간단히 언급되었습니다. 재고자산은 전년과 유사합니다." }
      ],
      "full_text": "샘플전자 2024 우발부채 재고자산 매출액 280조원", "char_count": 70, "truncated": false
    },
    {
      "corp_code": "00000002", "corp_name": "샘플건설", "stock_code": "000002", "market": "KOSPI",
      "rcept_no": "20260325000002", "report_nm": "[기재정정]사업보고서 (2025.12)", "report_type": "사업보고서",
      "rcept_dt": "20260325", "year": "2025",
      "filing_group_key": "00000002_사업보고서_2025", "is_latest_version": true,
      "is_amended": true, "amendment_type": "기재정정", "version_count": 2,
      "dart_url": "https://dart.fss.or.kr",
      "summary": "(데모) 샘플건설은 주택·토목 시공과 부동산 개발을 하는 가상의 건설사입니다. 올해는 PF(프로젝트 파이낸싱)와 책임준공 관련 우발채무 설명이 늘었습니다. 본 보고서는 정정(기재정정) 사례 시연용입니다.",
      "key_metrics": {
        "business": "주택·토목 시공 및 부동산 개발 건설사 (데모)",
        "key_points": ["부동산 PF 우발채무 관련 설명 확대", "책임준공 약정 증가", "미분양 관련 손실충당 언급"],
        "revenue": "12조원 (예시)", "operating_profit": "5천억원 (예시)", "net_profit": "3천억원 (예시)"
      },
      "sections": [
        { "title": "I. 회사의 개요", "section_path": "I. 회사의 개요",
          "text": "샘플건설은 데모용 가상의 건설사입니다. 주택, 토목, 부동산 개발을 주요 사업으로 합니다." },
        { "title": "II. 사업의 내용", "section_path": "II. 사업의 내용 > 주요 사업",
          "text": "주택 분양과 토목 시공이 핵심입니다. 미분양 리스크와 공사손실충당부채에 대한 설명이 포함됩니다." },
        { "title": "III. 재무에 관한 사항", "section_path": "III. 재무에 관한 사항 > 우발부채 및 약정사항",
          "text": "부동산 PF 관련 우발채무와 책임준공 약정이 존재합니다. PF 보증 규모가 전년 대비 증가했다고 가정합니다. 우발부채 합계는 (예시) 2조원입니다." }
      ],
      "full_text": "샘플건설 PF 책임준공 우발부채 우발채무 미분양 공사손실충당부채", "char_count": 110, "truncated": false
    },
    {
      "corp_code": "00000003", "corp_name": "샘플바이오", "stock_code": "000003", "market": "KOSDAQ",
      "rcept_no": "20260320000003", "report_nm": "사업보고서 (2025.12)", "report_type": "사업보고서",
      "rcept_dt": "20260320", "year": "2025",
      "filing_group_key": "00000003_사업보고서_2025", "is_latest_version": true,
      "is_amended": false, "amendment_type": null, "version_count": 1,
      "dart_url": "https://dart.fss.or.kr",
      "summary": "(데모) 샘플바이오는 신약 개발과 위탁생산(CMO)을 하는 가상의 제약·바이오 기업입니다. 항암제와 백신 파이프라인을 보유했다고 가정합니다.",
      "key_metrics": {
        "business": "신약 개발·위탁생산(CMO) 제약·바이오 기업 (데모)",
        "key_points": ["항암제·백신 파이프라인 보유(가정)", "연구개발비 비중이 높음", "계속기업 관련 일반적 안내"],
        "revenue": "5천억원 (예시)", "operating_profit": "300억원 (예시)", "net_profit": "200억원 (예시)"
      },
      "sections": [
        { "title": "I. 회사의 개요", "section_path": "I. 회사의 개요",
          "text": "샘플바이오는 데모용 가상의 제약·바이오 기업입니다. 신약 개발과 위탁생산(CMO)을 합니다." },
        { "title": "II. 사업의 내용", "section_path": "II. 사업의 내용 > 파이프라인",
          "text": "주요 파이프라인은 항암제와 백신입니다. 연구개발비 비중이 높습니다. 검색창에 '백신'이나 '항암제'를 입력해 보세요." }
      ],
      "full_text": "샘플바이오 신약 항암제 백신 위탁생산 CMO 연구개발", "char_count": 80, "truncated": false
    }
  ]
};
