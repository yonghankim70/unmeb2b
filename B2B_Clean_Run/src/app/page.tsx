import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import { readExcelData, readGlobalSettings, Product } from '@/lib/db';
import { isCloudDbEnabled } from '@/lib/cloudflareD1';
import { readCloudGlobalSettings, readCloudMasterData } from '@/lib/cloudData';
import DashboardClient from '@/components/DashboardClient';

export const dynamic = 'force-dynamic';

function shouldShowProductServer(product: Product, session: any): boolean {
  // 노출제외(노출제외 컬럼) 필터링 우선 수행
  if (session && product.노출제외) {
    const myName = String(session.customerName || '').trim().toLowerCase();
    if (myName) {
      const excludedCustomers = String(product.노출제외)
        .split(',')
        .map(s => s.trim().toLowerCase());
      if (excludedCustomers.includes(myName)) {
        return false;
      }
    }
  }

  const exposure = String(product.노출여부 || '').trim().toLowerCase();

  // 빈칸인 경우 기본값 노출
  if (exposure === '') {
    return true;
  }

  // 'n' -> 비노출
  if (exposure === 'n') {
    return false;
  }

  // 'y' -> 전체 노출
  if (exposure === 'y') {
    return true;
  }

  if (!session) {
    return true;
  }

  const myGrade = String(session.discountGrade || 'C').trim().toLowerCase();
  const myName = String(session.customerName || '').trim().toLowerCase();
  
  const allowedItems = exposure.split(',').map(item => item.trim().toLowerCase());
  
  // 등급 포함 여부
  if (allowedItems.includes(myGrade)) {
    return true;
  }

  // 업체명 포함 여부
  if (allowedItems.includes(myName)) {
    return true;
  }

  return false;
}

function isOwnerCartAllowedServer(session: any): boolean {
  if (session?.isAdmin) {
    return true;
  }
  return String(session?.쥔장장바구니허락 || 'n').trim().toLowerCase() === 'y';
}

function hasExposureHistoryServer(product: Product): boolean {
  return String(product.업로드일자 || '').trim() !== '';
}

function isOwnerCartCandidateServer(product: Product): boolean {
  const exposure = String(product.노출여부 || '').trim().toLowerCase();
  return (exposure === 'n' || exposure === '') && !hasExposureHistoryServer(product);
}

function shouldShowOwnerCartProductServer(product: Product, session: any): boolean {
  if (!isOwnerCartAllowedServer(session)) {
    return false;
  }

  if (String(product.쥔장장바구니노출 || 'y').trim().toLowerCase() === 'n') {
    return false;
  }

  if (!isOwnerCartCandidateServer(product)) {
    return false;
  }

  if (session && product.노출제외) {
    const myName = String(session.customerName || '').trim().toLowerCase();
    const excludedCustomers = String(product.노출제외)
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    if (myName && excludedCustomers.includes(myName)) {
      return false;
    }
  }

  return true;
}

export default async function Home() {
  const session = await getAuthSession();

  // Load products dynamically from Excel database
  const data = isCloudDbEnabled() ? await readCloudMasterData() : readExcelData();
  const { products, customers } = data;
  const globalSettings = isCloudDbEnabled() ? await readCloudGlobalSettings() : readGlobalSettings();

  const customerRecord = session
    ? customers.find(c => String(c.거래처명 || '').trim().toLowerCase() === String(session.customerName || '').trim().toLowerCase())
    : null;
  const hydratedSession = session
    ? {
        ...session,
        쥔장장바구니허락: customerRecord?.쥔장장바구니허락 || session.쥔장장바구니허락 || 'n',
      }
    : session;

  // 서버 사이드에서 비노출 상품 필터링 처리 (전송 용량 및 클라이언트 메모리 최적화)
  const ownerCartAllowed = isOwnerCartAllowedServer(hydratedSession);
  const filteredProducts = products.filter(p => (
    shouldShowProductServer(p, hydratedSession) ||
    (ownerCartAllowed && shouldShowOwnerCartProductServer(p, hydratedSession))
  ));

  return (
    <DashboardClient 
      products={filteredProducts} 
      session={hydratedSession} 
      globalSettings={globalSettings}
    />
  );
}
