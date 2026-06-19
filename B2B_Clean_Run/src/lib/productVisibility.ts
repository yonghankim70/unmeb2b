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
