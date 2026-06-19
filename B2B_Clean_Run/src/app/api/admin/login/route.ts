import { NextRequest, NextResponse } from 'next/server';
import { setAdminSession, verifyAdminPassword } from '@/lib/adminAuth';
import { setAuthSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (!verifyAdminPassword(password)) {
      return NextResponse.json(
        { success: false, message: '관리자 비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      );
    }

    await setAdminSession();
    await setAuthSession({
      customerName: '관리자',
      discountGrade: 'ADMIN',
      쥔장장바구니허락: 'y',
      isAdmin: true,
    });
    return NextResponse.json({ success: true, message: '관리자 로그인이 완료되었습니다.' });
  } catch (error) {
    console.error('[Admin Login API] Error:', error);
    return NextResponse.json(
      { success: false, message: '관리자 로그인 중 서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
