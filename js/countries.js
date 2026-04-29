// ISO-3166-1 alpha-2 country codes with Korean names.
// Used for the admin "Access Control" picker.

export const COUNTRIES = [
  { code: "KR", name: "대한민국" },
  { code: "US", name: "미국" },
  { code: "JP", name: "일본" },
  { code: "CN", name: "중국" },
  { code: "TW", name: "대만" },
  { code: "HK", name: "홍콩" },
  { code: "MO", name: "마카오" },
  { code: "GB", name: "영국" },
  { code: "DE", name: "독일" },
  { code: "FR", name: "프랑스" },
  { code: "IT", name: "이탈리아" },
  { code: "ES", name: "스페인" },
  { code: "PT", name: "포르투갈" },
  { code: "NL", name: "네덜란드" },
  { code: "BE", name: "벨기에" },
  { code: "CH", name: "스위스" },
  { code: "AT", name: "오스트리아" },
  { code: "SE", name: "스웨덴" },
  { code: "NO", name: "노르웨이" },
  { code: "DK", name: "덴마크" },
  { code: "FI", name: "핀란드" },
  { code: "IE", name: "아일랜드" },
  { code: "PL", name: "폴란드" },
  { code: "CZ", name: "체코" },
  { code: "RU", name: "러시아" },
  { code: "UA", name: "우크라이나" },
  { code: "TR", name: "튀르키예" },
  { code: "GR", name: "그리스" },
  { code: "RO", name: "루마니아" },
  { code: "HU", name: "헝가리" },
  { code: "CA", name: "캐나다" },
  { code: "MX", name: "멕시코" },
  { code: "BR", name: "브라질" },
  { code: "AR", name: "아르헨티나" },
  { code: "CL", name: "칠레" },
  { code: "CO", name: "콜롬비아" },
  { code: "PE", name: "페루" },
  { code: "AU", name: "호주" },
  { code: "NZ", name: "뉴질랜드" },
  { code: "IN", name: "인도" },
  { code: "PK", name: "파키스탄" },
  { code: "BD", name: "방글라데시" },
  { code: "LK", name: "스리랑카" },
  { code: "SG", name: "싱가포르" },
  { code: "MY", name: "말레이시아" },
  { code: "TH", name: "태국" },
  { code: "VN", name: "베트남" },
  { code: "PH", name: "필리핀" },
  { code: "ID", name: "인도네시아" },
  { code: "KH", name: "캄보디아" },
  { code: "LA", name: "라오스" },
  { code: "MM", name: "미얀마" },
  { code: "MN", name: "몽골" },
  { code: "KP", name: "조선민주주의인민공화국" },
  { code: "AE", name: "아랍에미리트" },
  { code: "SA", name: "사우디아라비아" },
  { code: "IL", name: "이스라엘" },
  { code: "IR", name: "이란" },
  { code: "IQ", name: "이라크" },
  { code: "QA", name: "카타르" },
  { code: "KW", name: "쿠웨이트" },
  { code: "BH", name: "바레인" },
  { code: "OM", name: "오만" },
  { code: "JO", name: "요르단" },
  { code: "LB", name: "레바논" },
  { code: "EG", name: "이집트" },
  { code: "ZA", name: "남아프리카공화국" },
  { code: "NG", name: "나이지리아" },
  { code: "KE", name: "케냐" },
  { code: "MA", name: "모로코" },
  { code: "TN", name: "튀니지" },
  { code: "DZ", name: "알제리" },
  { code: "ET", name: "에티오피아" },
  { code: "GH", name: "가나" },
  { code: "UZ", name: "우즈베키스탄" },
  { code: "KZ", name: "카자흐스탄" },
  { code: "BY", name: "벨라루스" },
  { code: "BG", name: "불가리아" },
  { code: "HR", name: "크로아티아" },
  { code: "SK", name: "슬로바키아" },
  { code: "SI", name: "슬로베니아" },
  { code: "RS", name: "세르비아" },
  { code: "EE", name: "에스토니아" },
  { code: "LV", name: "라트비아" },
  { code: "LT", name: "리투아니아" },
  { code: "IS", name: "아이슬란드" },
  { code: "LU", name: "룩셈부르크" },
  { code: "MT", name: "몰타" },
  { code: "CY", name: "키프로스" }
];

const _map = new Map(COUNTRIES.map((c) => [c.code, c.name]));

export function countryName(code) {
  if (!code) return "";
  const u = String(code).toUpperCase();
  return _map.get(u) || u;
}

export function countryFlagEmoji(code) {
  if (!code || code.length !== 2) return "";
  const A = 0x1f1e6;
  const a = "A".charCodeAt(0);
  try {
    return String.fromCodePoint(
      A + (code.charCodeAt(0) - a),
      A + (code.charCodeAt(1) - a)
    );
  } catch (e) { return ""; }
}
