import type { Product } from '@/lib/db';

export interface StorefrontSession {
  customerName?: string;
  discountGrade?: string;
  쥔장장바구니허락?: string;
  isAdmin?: boolean;
}

function normalized(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function exposureTokens(product: Product): string[] {
  return String(product.노출여부 || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isExcludedForSession(product: Product, session?: StorefrontSession | null): boolean {
  if (!session || !product.노출제외) return false;

  const customerName = normalized(session.customerName);
  if (!customerName) return false;

  return String(product.노출제외)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(customerName);
}

export function shouldShowProduct(product: Product, session?: StorefrontSession | null): boolean {
  if (isExcludedForSession(product, session)) {
    return false;
  }

  const exposure = normalized(product.노출여부);

  // 빈칸/n은 아직 일반 카테고리에 공개하지 않은 상태입니다.
  if (!exposure || exposure === 'n') {
    return false;
  }

  if (exposure === 'y') {
    return true;
  }

  if (!session) {
    return false;
  }

  const tokens = exposureTokens(product);
  const grade = normalized(session.discountGrade || 'C');
  const customerName = normalized(session.customerName);

  return tokens.includes(grade) || (customerName ? tokens.includes(customerName) : false);
}

export function isOwnerCartAllowed(session?: StorefrontSession | null): boolean {
  if (session?.isAdmin) {
    return true;
  }
  return normalized(session?.쥔장장바구니허락) === 'y';
}

export function isOwnerCartCandidate(product: Product): boolean {
  const exposure = normalized(product.노출여부);
  return !exposure || exposure === 'n';
}

export function shouldShowOwnerCartProduct(
  product: Product,
  session?: StorefrontSession | null
): boolean {
  if (!isOwnerCartAllowed(session)) {
    return false;
  }

  if (normalized(product.쥔장장바구니노출 || 'y') === 'n') {
    return false;
  }

  if (!isOwnerCartCandidate(product)) {
    return false;
  }

  return !isExcludedForSession(product, session);
}

export function getProductMainCategories(product: Product): string[] {
  const mainCategories = new Set<string>();

  if (product.카테고리) {
    const parts = product.카테고리.split(',').map((item) => item.trim());
    parts.forEach((name) => {
      if (name === '신상') mainCategories.add('NEW');
      else if (name === '선기획') mainCategories.add('선기획');
    });
  }

  if (product.아이템) {
    const itemText = product.아이템.trim();
    const match = itemText.match(/^([a-zA-Z0-9-]+)(?:\(([^)]+)\))?/);
    if (match) {
      const code = match[1].toUpperCase();
      const koName = (match[2] || '').trim();

      if (code === 'KT' || code === 'NS' || koName === '니트' || koName === '나시') {
        mainCategories.add('KNIT');
      } else if (
        ['SH', 'BL', 'VT', 'TS'].includes(code) ||
        ['블라우스', '셔츠/남방', '셔츠', '베스트', '티셔츠'].includes(koName)
      ) {
        mainCategories.add('TOP');
      } else if (
        ['PT', 'SK', 'HPT'].includes(code) ||
        ['팬츠', '반바지', '스커트'].includes(koName)
      ) {
        mainCategories.add('BOTTOM');
      } else if (
        ['L-JK', 'SET', 'Y', 'JP', 'JK', 'CT'].includes(code) ||
        ['레자', '세트', '가디건', '점퍼', '자켓', '코트'].includes(koName)
      ) {
        mainCategories.add('OUTER');
      } else if (
        ['ONE-PIECE', 'OPS'].includes(code) ||
        koName === '원피스'
      ) {
        mainCategories.add('ONE-PIECE');
      }
    }
  }

  return Array.from(mainCategories);
}

function getProductCode(product: Product): string {
  return String(product.임시코드 || product.상품명 || '').trim();
}

function parseUploadDateScore(value: unknown): number {
  const raw = String(value || '').trim();
  if (!raw) return 0;

  const isoMatch = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  }

  const monthDayMatch = raw.match(/^(\d{1,2})[-./](\d{1,2})/);
  if (monthDayMatch) {
    const [, month, day] = monthDayMatch;
    return new Date(new Date().getFullYear(), Number(month) - 1, Number(day)).getTime();
  }

  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function fallbackNewestCompare(a: Product, b: Product): number {
  const uploadDateDiff = parseUploadDateScore(b.업로드일자) - parseUploadDateScore(a.업로드일자);
  if (uploadDateDiff !== 0) return uploadDateDiff;

  const weekDiff = String(b.주차 || '').localeCompare(String(a.주차 || ''), undefined, { numeric: true, sensitivity: 'base' });
  if (weekDiff !== 0) return weekDiff;

  return getProductCode(b).localeCompare(getProductCode(a), undefined, { numeric: true, sensitivity: 'base' });
}

export function getManualCategoryDisplayOrder(product: Product, category: string): number | null {
  const orderMap = product.카테고리노출순서;
  if (!orderMap || typeof orderMap !== 'object') return null;

  const candidates = [
    category,
    category.toUpperCase(),
    category === 'ALL' ? '전체' : '',
    category === 'OWNER-CART' ? '쥔장장바구니' : '',
  ].filter(Boolean);

  for (const key of candidates) {
    const value = Number(orderMap[key]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
}

export function compareProductsForStorefront(a: Product, b: Product, category: string): number {
  const aManualOrder = getManualCategoryDisplayOrder(a, category);
  const bManualOrder = getManualCategoryDisplayOrder(b, category);

  if (aManualOrder !== null && bManualOrder !== null) {
    const manualDiff = aManualOrder - bManualOrder;
    if (manualDiff !== 0) return manualDiff;
  } else if (aManualOrder !== null) {
    return -1;
  } else if (bManualOrder !== null) {
    return 1;
  }

  const aRecommended = Number(a.추천 || 0) > 0;
  const bRecommended = Number(b.추천 || 0) > 0;

  if (aRecommended && !bRecommended) return -1;
  if (!aRecommended && bRecommended) return 1;

  if (aRecommended && bRecommended) {
    const recommendedDiff = Number(a.추천 || 0) - Number(b.추천 || 0);
    if (recommendedDiff !== 0) return recommendedDiff;
  }

  return fallbackNewestCompare(a, b);
}

export function sortProductsForStorefront(products: Product[], category: string): Product[] {
  return [...products].sort((a, b) => compareProductsForStorefront(a, b, category));
}
