import { NextResponse } from 'next/server';
import { clearAuthSession } from '@/lib/auth';

export async function POST() {
  try {
    await clearAuthSession();
    return NextResponse.json({ success: true, message: '로그아웃 되었습니다.' });
  } catch (error) {
    console.error('Logout API error:', error);
    return NextResponse.json(
      { success: false, message: '로그아웃 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
