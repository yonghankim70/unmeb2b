import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/adminAuth';

export async function GET() {
  const authenticated = await isAdminAuthenticated();
  return NextResponse.json({ success: true, authenticated });
}
