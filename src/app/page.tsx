import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import { readExcelData, readGlobalSettings, Product } from '@/lib/db';
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

export default async function Home() {
  const session = await getAuthSession();

  // Load products dynamically from Excel database
  const { products } = readExcelData();
  const globalSettings = readGlobalSettings();

  // 서버 사이드에서 비노출 상품 필터링 처리 (전송 용량 및 클라이언트 메모리 최적화)
  const filteredProducts = products.filter(p => shouldShowProductServer(p, session));

  return (
    <DashboardClient 
      products={filteredProducts} 
      session={session} 
      globalSettings={globalSettings}
    />
  );
}

