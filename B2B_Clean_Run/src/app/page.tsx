import { getAuthSession } from '@/lib/auth';
import { readExcelData, readGlobalSettings } from '@/lib/db';
import { isCloudDbEnabled } from '@/lib/cloudflareD1';
import { readCloudGlobalSettings, readCloudMasterData } from '@/lib/cloudData';
import {
  isOwnerCartAllowed,
  shouldShowOwnerCartProduct,
  shouldShowProduct,
} from '@/lib/productVisibility';
import DashboardClient from '@/components/DashboardClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
  const ownerCartAllowed = isOwnerCartAllowed(hydratedSession);
  const filteredProducts = products.filter(p => (
    shouldShowProduct(p, hydratedSession) ||
    (ownerCartAllowed && shouldShowOwnerCartProduct(p, hydratedSession))
  ));

  return (
    <DashboardClient 
      products={filteredProducts} 
      session={hydratedSession} 
      globalSettings={globalSettings}
    />
  );
}
