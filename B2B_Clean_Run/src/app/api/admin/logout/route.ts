import { NextResponse } from 'next/server';
import { clearAdminSession } from '@/lib/adminAuth';
import { clearAuthSession } from '@/lib/auth';

export async function POST() {
  await clearAdminSession();
  await clearAuthSession();
  return NextResponse.json({ success: true, message: '관리자 로그아웃이 완료되었습니다.' });
}
