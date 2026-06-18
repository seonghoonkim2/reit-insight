// 상장리츠(REIT) 데모 데이터 — GoInsider급 리츠 상세를 시연하기 위한 예시.
// ⚠️ 종목명·종목코드는 실제 값이지만, 주가·시총·배당수익률·NAV배율·신용등급 등 숫자는 모두 예시 샘플입니다.
// ⚠️ AI 요약은 참고용이며 투자 권유가 아닙니다. (collect_reits.py 실행 시 실데이터로 대체)
window.__REITS__ = [
  {
    "ticker": "330590", "name": "롯데리츠", "sector": "리테일", "market": "KOSPI",
    "price": "3,200원(예시)", "market_cap": "1.2조원(예시)", "dividend_yield": "6.7", "dividend_freq": "반기",
    "nav_ratio": "0.85배(예시)", "amc": "롯데에이엠씨", "listing_date": "2019-10-30", "credit_rating": "AA-(예시)", "pay_months": [3, 9],
    "week52_high": "3,450원(예시)", "week52_low": "2,900원(예시)",
    "portfolio": ["롯데백화점 강남점", "롯데마트 다수 점포", "롯데아울렛", "롯데물류센터"],
    "summary": "(데모) 롯데리츠는 롯데백화점·마트 등 리테일 부동산을 기초자산으로 하는 상장리츠입니다. 임대료 기반의 안정적 현금흐름과 반기 배당이 특징이며, 소비 경기와 점포 임대 조건이 핵심 변수입니다. 숫자는 예시이며 본 요약은 투자 권유가 아닙니다.",
    "key_points": ["리테일(백화점·마트) 자산 중심", "반기 배당 · 배당수익률 예시 6.7%", "소비경기·임대조건이 핵심 변수"],
    "corp_code": "", "homepage": "https://www.lottereit.co.kr"
  },
  {
    "ticker": "395400", "name": "SK리츠", "sector": "복합/인프라", "market": "KOSPI",
    "price": "4,800원(예시)", "market_cap": "1.6조원(예시)", "dividend_yield": "5.4", "dividend_freq": "분기",
    "nav_ratio": "0.95배(예시)", "amc": "SK리츠운용", "listing_date": "2021-09-14", "credit_rating": "AA(예시)", "pay_months": [3, 6, 9, 12],
    "week52_high": "5,200원(예시)", "week52_low": "4,300원(예시)",
    "portfolio": ["SK서린빌딩(본사 오피스)", "전국 SK 주유소 포트폴리오", "분당 데이터센터(예시)"],
    "summary": "(데모) SK리츠는 SK그룹 본사 오피스와 주유소·인프라 자산을 담은 복합형 리츠로, 국내 상장리츠 중 드물게 분기 배당을 합니다. 장기 책임임대 구조가 현금흐름을 뒷받침하지만 금리와 차입조건의 영향을 받습니다. 숫자는 예시입니다.",
    "key_points": ["오피스+주유소+인프라 복합", "분기 배당(국내 리츠 중 드묾)", "장기 책임임대 구조"],
    "corp_code": "", "homepage": "https://www.skreits.com"
  },
  {
    "ticker": "365550", "name": "ESR켄달스퀘어리츠", "sector": "물류", "market": "KOSPI",
    "price": "3,900원(예시)", "market_cap": "1.0조원(예시)", "dividend_yield": "6.9", "dividend_freq": "반기",
    "nav_ratio": "0.80배(예시)", "amc": "켄달스퀘어자산운용", "listing_date": "2020-12-23", "credit_rating": "A+(예시)", "pay_months": [2, 8],
    "week52_high": "4,500원(예시)", "week52_low": "3,400원(예시)",
    "portfolio": ["부천 물류센터", "고양 물류센터", "안성 물류센터", "이천·용인 물류센터(예시)"],
    "summary": "(데모) ESR켄달스퀘어리츠는 수도권 핵심 물류센터를 기초자산으로 하는 국내 대표 물류 리츠입니다. 이커머스 성장에 따른 물류 수요가 긍정 요인이나, 신규 물류센터 공급과 공실·임대료가 변수입니다. 숫자는 예시입니다.",
    "key_points": ["수도권 물류센터 중심", "이커머스 수요 수혜 가능", "공급과잉·공실이 리스크"],
    "corp_code": "", "homepage": "https://www.esrkendallsquarereit.com"
  },
  {
    "ticker": "293940", "name": "신한알파리츠", "sector": "오피스", "market": "KOSPI",
    "price": "6,100원(예시)", "market_cap": "7,000억원(예시)", "dividend_yield": "5.8", "dividend_freq": "반기",
    "nav_ratio": "0.90배(예시)", "amc": "신한리츠운용", "listing_date": "2018-08-27", "credit_rating": "A+(예시)", "pay_months": [6, 12],
    "week52_high": "6,800원(예시)", "week52_low": "5,500원(예시)",
    "portfolio": ["판교 크래프톤타워(그래비티)", "용산 더프라임타워", "트윈시티 남산", "대일빌딩(예시)"],
    "summary": "(데모) 신한알파리츠는 판교·서울 도심의 프라임 오피스를 담은 오피스 리츠입니다. 우량 임차인과 낮은 공실률이 강점이며, 오피스 임대시장과 금리가 주요 변수입니다. 숫자는 예시입니다.",
    "key_points": ["판교·서울 프라임 오피스", "우량 임차인·낮은 공실", "오피스 임대·금리 변수"],
    "corp_code": "", "homepage": "https://www.shalphareit.com"
  },
  {
    "ticker": "348950", "name": "제이알글로벌리츠", "sector": "해외오피스", "market": "KOSPI",
    "price": "4,200원(예시)", "market_cap": "8,500억원(예시)", "dividend_yield": "8.2", "dividend_freq": "반기",
    "nav_ratio": "0.70배(예시)", "amc": "제이알투자운용", "listing_date": "2020-08-07", "credit_rating": "A(예시)", "pay_months": [3, 9],
    "week52_high": "4,900원(예시)", "week52_low": "3,700원(예시)",
    "portfolio": ["벨기에 브뤼셀 파이낸스타워(정부청사 임차)"],
    "summary": "(데모) 제이알글로벌리츠는 벨기에 브뤼셀의 대형 오피스를 기초자산으로 하는 해외 부동산 리츠입니다. 높은 배당수익률(예시)이 특징이나, 환율과 해외 임대차·금리 변동에 노출됩니다. 숫자는 예시입니다.",
    "key_points": ["해외(벨기에) 오피스 단일 자산", "높은 배당수익률(예시 8.2%)", "환율·해외금리 리스크"],
    "corp_code": "", "homepage": "https://www.jrglobalreit.com"
  },
  {
    "ticker": "357250", "name": "코람코라이프인프라리츠", "sector": "인프라", "market": "KOSPI",
    "price": "5,300원(예시)", "market_cap": "5,500억원(예시)", "dividend_yield": "6.1", "dividend_freq": "반기",
    "nav_ratio": "0.88배(예시)", "amc": "코람코자산신탁", "listing_date": "2018-06-27", "credit_rating": "A(예시)", "pay_months": [5, 11],
    "week52_high": "5,900원(예시)", "week52_low": "4,800원(예시)",
    "portfolio": ["전국 주유소 포트폴리오", "물류·인프라 자산(예시)"],
    "summary": "(데모) 코람코라이프인프라리츠는 전국 주유소 등 인프라 자산을 기초로 하는 리츠입니다. 장기 임대 기반의 안정적 수익이 강점이며, 자산 재계약·유가/에너지 전환 추세가 변수입니다. 숫자는 예시입니다.",
    "key_points": ["주유소 등 인프라 자산", "장기 임대 기반 안정성", "에너지 전환·재계약 변수"],
    "corp_code": "", "homepage": "https://www.koramcolifeinfra.co.kr"
  },
  {
    "ticker": "357430", "name": "미래에셋맵스리츠", "sector": "리테일", "market": "KOSPI",
    "price": "3,500원(예시)", "market_cap": "1,500억원(예시)", "dividend_yield": "6.4", "dividend_freq": "반기",
    "nav_ratio": "0.82배(예시)", "amc": "미래에셋자산운용", "listing_date": "2020-08-05", "credit_rating": "A(예시)", "pay_months": [2, 8],
    "week52_high": "3,900원(예시)", "week52_low": "3,100원(예시)",
    "portfolio": ["광교 센트럴푸르지오시티 상업시설", "분당스퀘어(예시)"],
    "summary": "(데모) 미래에셋맵스리츠는 수도권 상업시설을 기초자산으로 하는 리테일 리츠입니다. 상권·임차 구성에 따라 수익이 달라지며, 비교적 소규모라 자산 편입/매각 이벤트의 영향이 큽니다. 숫자는 예시입니다.",
    "key_points": ["수도권 상업시설 중심", "소규모 — 자산 이벤트 영향 큼", "상권·임차구성이 변수"],
    "corp_code": "", "homepage": "https://www.maps-reit.com"
  },
  {
    "ticker": "404990", "name": "신한서부티엔디리츠", "sector": "복합(호텔/리테일)", "market": "KOSPI",
    "price": "3,800원(예시)", "market_cap": "3,000억원(예시)", "dividend_yield": "5.6", "dividend_freq": "반기",
    "nav_ratio": "0.78배(예시)", "amc": "신한리츠운용", "listing_date": "2021-12-10", "credit_rating": "A-(예시)", "pay_months": [3, 9],
    "week52_high": "4,300원(예시)", "week52_low": "3,300원(예시)",
    "portfolio": ["그랜드머큐어 앰배서더 호텔 용산", "스퀘어원(인천 리테일)"],
    "summary": "(데모) 신한서부티엔디리츠는 호텔과 리테일을 함께 담은 복합형 리츠입니다. 관광·소비 회복이 호재가 될 수 있으나, 호텔 운영실적 변동성이 리테일보다 큰 편입니다. 숫자는 예시입니다.",
    "key_points": ["호텔+리테일 복합형", "관광·소비 회복 시 수혜 가능", "호텔 운영 변동성 유의"],
    "corp_code": "", "homepage": "https://www.shsbtndreit.com"
  },
  {
    "ticker": "088260", "name": "이리츠코크렙", "sector": "리테일", "market": "KOSPI",
    "price": "6,100원(예시)", "market_cap": "3,900억원(예시)", "dividend_yield": "7.0", "dividend_freq": "반기",
    "nav_ratio": "0.95배(예시)", "amc": "코람코자산신탁", "credit_rating": "A(예시)",
    "portfolio": ["뉴코아 강남·일산·평촌", "2001아울렛 중계·분당"],
    "summary": "(데모) 이리츠코크렙은 이랜드 계열 뉴코아·2001아울렛 등 리테일 부동산을 기초로 하는 상장리츠입니다. 책임임대 기반의 안정적 현금흐름이 특징이며, 임차인 신용과 소비 경기가 핵심 변수입니다. 숫자는 예시입니다.",
    "key_points": ["뉴코아·2001아울렛 리테일 자산", "책임임대 기반 안정적 현금흐름", "임차인 신용·소비경기 변수"],
    "corp_code": ""
  },
  {
    "ticker": "451800", "name": "한화리츠", "sector": "오피스", "market": "KOSPI",
    "price": "4,800원(예시)", "market_cap": "5,400억원(예시)", "dividend_yield": "7.4", "dividend_freq": "반기",
    "nav_ratio": "0.88배(예시)", "amc": "한화자산운용", "credit_rating": "A(예시)",
    "portfolio": ["한화생명 여의도 사옥 등 한화생명 사옥"],
    "summary": "(데모) 한화리츠는 한화생명 사옥 등 우량 오피스를 기초자산으로 하는 오피스 리츠입니다. 장기 책임임대 기반의 안정적 임대수익이 강점이며, 오피스 임대시장과 금리가 주요 변수입니다. 숫자는 예시입니다.",
    "key_points": ["한화생명 사옥 등 오피스", "장기 책임임대 기반 안정성", "오피스 임대·금리 변수"],
    "corp_code": ""
  },
  {
    "ticker": "432320", "name": "KB스타리츠", "sector": "복합", "market": "KOSPI",
    "price": "4,200원(예시)", "market_cap": "7,200억원(예시)", "dividend_yield": "7.9", "dividend_freq": "반기",
    "nav_ratio": "0.82배(예시)", "amc": "KB자산운용", "credit_rating": "A(예시)",
    "portfolio": ["벨기에 노스갤럭시 타워 등 국내외 오피스"],
    "summary": "(데모) KB스타리츠는 해외(벨기에)·국내 오피스를 담은 복합형 리츠입니다. 글로벌 우량 임차인 기반의 임대수익이 특징이나, 환율과 해외 금리·임대차 조건에 노출됩니다. 숫자는 예시입니다.",
    "key_points": ["국내외 오피스 복합", "글로벌 우량 임차인", "환율·해외금리 리스크"],
    "corp_code": ""
  },
  {
    "ticker": "417310", "name": "코람코더원리츠", "sector": "오피스", "market": "KOSPI",
    "price": "5,000원(예시)", "market_cap": "3,000억원(예시)", "dividend_yield": "8.3", "dividend_freq": "반기",
    "nav_ratio": "0.85배(예시)", "amc": "코람코자산운용", "credit_rating": "A-(예시)",
    "portfolio": ["여의도 하나증권 빌딩"],
    "summary": "(데모) 코람코더원리츠는 여의도 핵심 오피스를 기초자산으로 하는 오피스 리츠입니다. 우량 임차인과 입지가 강점이며, 오피스 공실·임대료와 금리가 주요 변수입니다. 숫자는 예시입니다.",
    "key_points": ["여의도 프라임 오피스", "우량 임차인·입지", "오피스 임대·금리 변수"],
    "corp_code": ""
  },
  {
    "ticker": "400760", "name": "NH올원리츠", "sector": "복합", "market": "KOSPI",
    "price": "3,600원(예시)", "market_cap": "2,000억원(예시)", "dividend_yield": "8.1", "dividend_freq": "반기",
    "nav_ratio": "0.80배(예시)", "amc": "엔에이치리츠운용", "credit_rating": "A-(예시)",
    "portfolio": ["오피스·물류 복합 포트폴리오"],
    "summary": "(데모) NH올원리츠는 오피스·물류 등 여러 유형의 자산을 담은 복합형 리츠입니다. 자산 다변화로 변동성을 분산하지만, 개별 자산 임대차·금리 환경의 영향을 받습니다. 숫자는 예시입니다.",
    "key_points": ["오피스·물류 등 복합 자산", "자산 다변화로 분산", "임대차·금리 환경 변수"],
    "corp_code": ""
  }
];
