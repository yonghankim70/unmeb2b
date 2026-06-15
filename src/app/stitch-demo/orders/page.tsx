import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import { readOrdersByCustomer, readExcelData } from '@/lib/db';
import StitchOrdersClient from '@/components/StitchOrdersClient';

export const dynamic = 'force-dynamic';

export default async function StitchOrdersPage() {
  const session = await getAuthSession();

  // Redirect to login if not authenticated
  if (!session) {
    redirect('/login');
  }

  // Load this specific customer's orders
  const orders = readOrdersByCustomer(session.customerName);
  const { products } = readExcelData();

  return (
    <StitchOrdersClient orders={orders} session={session} products={products} />
  );
}

