import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import { readOrdersByCustomer, readExcelData } from '@/lib/db';
import { isCloudDbEnabled } from '@/lib/cloudflareD1';
import { readCloudMasterData, readCloudOrdersByCustomer } from '@/lib/cloudData';
import OrdersClient from '@/components/OrdersClient';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const session = await getAuthSession();

  // Redirect to login if not authenticated
  if (!session) {
    redirect('/login');
  }

  // Load this specific customer's orders
  const orders = isCloudDbEnabled()
    ? await readCloudOrdersByCustomer(session.customerName)
    : readOrdersByCustomer(session.customerName);
  const { products } = isCloudDbEnabled() ? await readCloudMasterData() : readExcelData();

  return (
    <OrdersClient orders={orders} session={session} products={products} />
  );
}
