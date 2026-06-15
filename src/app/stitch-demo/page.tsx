import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/auth';
import { readExcelData, readGlobalSettings } from '@/lib/db';
import StitchDashboardClient from '@/components/StitchDashboardClient';

export const dynamic = 'force-dynamic';

export default async function StitchDemoPage() {
  const session = await getAuthSession();

  // Load products dynamically from Excel database
  const { products } = readExcelData();
  const globalSettings = readGlobalSettings();

  return (
    <StitchDashboardClient 
      products={products} 
      session={session} 
      globalSettings={globalSettings}
    />
  );
}
