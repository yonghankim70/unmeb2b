export interface Customer {
  거래처명: string;
  접속코드: string;
  거래처등급: string;
  텔레그램ID?: string;
  결제방식?: string;
  세금계산서발행?: string;
  로그인차단?: string;
  쥔장장바구니허락?: string;
  최근접속일?: string;
}

export interface Product {
  업로드일자: string;
  노출여부: string;
  노출제외?: string;
  쥔장장바구니노출?: string;
  카테고리: string;
  주차: string;
  상품명: string;
  임시코드: string;
  아이템: string;
  컬러: string;
  사이즈: string;
  단가: number;
  환율: number;
  물류비: number;
  원가: number;
  도매가: number;
  S등급가: number;
  A등급: number;
  B등급: number;
  C등급: number;
  W등급가?: number;
  사입처: string;
  중국코드: string;
  신규등록대기?: boolean;
  포인트?: string;
  추천?: number;
  시즌?: string;
  등급할인제외?: string;
  동기화시간?: string;
  상세이미지목록?: string[];
  이미지버전?: string;
  카테고리노출순서?: Record<string, number>;
}

export interface ItemMaster {
  아이템: string;
  표기: string;
}

export interface ColorMaster {
  컬러: string;
  표기컬러: string;
}

export interface CategoryMaster {
  카테고리: string;
  등급: string;
  환율: number;
  물류비: number;
  마진율?: number;
  S등급비율?: number;
  A등급비율?: number;
  B등급비율?: number;
  C등급비율?: number;
  W등급비율?: number;
}

export interface OrderItem {
  productCode: string;
  color: string;
  size?: string;
  quantity: number;
}

export interface CartSnapshotItem {
  customerName: string;
  productCode: string;
  color: string;
  size?: string;
  quantity: number;
  category?: string;
  updatedAt: string;
}

export interface LoginLog {
  거래처명: string;
  접속일시: string;
  접속IP?: string;
}

export interface GlobalSettings {
  exchange: number;
  logistics: number;
  margin: number;
  sRatio: number;
  aRatio: number;
  bRatio: number;
  cRatio: number;
  wRatio: number;
  showCategoriesOnMain?: boolean;
  visibleColumns?: string[];
  columnWidths?: { [key: string]: number };
  pointOptions?: string[];
  seasonOptions?: string[];
  defaultSeason?: string;
  customerGradeOptions?: string[];
  migratedGradeExclude?: boolean;
  migratedGradeExcludeABC?: boolean;
  migratedOwnerCartVisible?: boolean;
  columnOrder?: string[];
}

export interface CustomerOrder {
  주문번호?: string;
  종결여부?: string;
  주문일시: string;
  거래처명: string;
  상품코드: string;
  컬러: string;
  사이즈?: string;
  수량: number;
  단가?: number;
  금액?: number;
  요청사항?: string;
  발송날짜?: string;
  전표번호?: string;
  주문확인?: string;
  출고상황?: string;
  발송처리?: string;
  택배사?: string;
  운송장번호?: string;
  입금확인?: string;
  입금방식?: string;
  입금금액?: number;
  입금자?: string;
}

export interface PaymentLog {
  id?: string;
  입금일자: string;
  거래처명: string;
  입금금액: number;
  입금방식: string;
  입금자: string;
  비고?: string;
}

function asString(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

function asNumber(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  const num = Number(value);
  return Number.isNaN(num) ? 0 : num;
}

export function formatProduct(p: any): Product {
  const unitPrice = asNumber(p['단가']);
  const hasUnitPrice = unitPrice > 0;
  const rawCategoryDisplayOrder = p['카테고리노출순서'];
  const categoryDisplayOrder = rawCategoryDisplayOrder && typeof rawCategoryDisplayOrder === 'object' && !Array.isArray(rawCategoryDisplayOrder)
    ? Object.fromEntries(
        Object.entries(rawCategoryDisplayOrder)
          .map(([key, value]) => [String(key).trim(), asNumber(value)])
          .filter(([key, value]) => key && Number(value) > 0)
      )
    : undefined;

  return {
    업로드일자: asString(p['업로드일자']),
    노출여부: asString(p['노출여부']),
    노출제외: asString(p['노출제외'] || ''),
    쥔장장바구니노출: asString(p['쥔장장바구니노출'] || 'y'),
    카테고리: asString(p['카테고리']),
    주차: asString(p['주차']),
    상품명: asString(p['상품명']),
    임시코드: asString(p['임시코드']),
    아이템: asString(p['아이템']),
    컬러: asString(p['컬러']),
    사이즈: asString(p['사이즈'] || 'free'),
    단가: unitPrice,
    환율: asNumber(p['환율']),
    물류비: asNumber(p['물류비']),
    원가: hasUnitPrice ? asNumber(p['원가']) : 0,
    도매가: hasUnitPrice ? asNumber(p['도매가']) : 0,
    S등급가: hasUnitPrice ? asNumber(p['S등급가']) : 0,
    A등급: hasUnitPrice ? asNumber(p['A등급']) : 0,
    B등급: hasUnitPrice ? asNumber(p['B등급']) : 0,
    C등급: hasUnitPrice ? asNumber(p['C등급']) : 0,
    W등급가: hasUnitPrice ? asNumber(p['W등급가']) : 0,
    사입처: asString(p['사입처']),
    중국코드: asString(p['중국코드']),
    신규등록대기: p['신규등록대기'] === undefined ? false : Boolean(p['신규등록대기']),
    포인트: asString(p['포인트'] || p['태그'] || ''),
    추천: p['추천'] === undefined
      ? 0
      : typeof p['추천'] === 'number'
        ? p['추천']
        : (p['추천'] === 'true' || p['추천'] === true ? 1 : (Number.isNaN(Number(p['추천'])) ? 0 : Number(p['추천']))),
    시즌: asString(p['시즌'] || ''),
    등급할인제외: asString(p['등급할인제외'] || ''),
    동기화시간: asString(p['동기화시간'] || ''),
    상세이미지목록: Array.isArray(p['상세이미지목록']) ? p['상세이미지목록'] : undefined,
    이미지버전: asString(p['이미지버전'] || ''),
    카테고리노출순서: categoryDisplayOrder,
  };
}
