import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { readExcelData, writeCustomers } from '@/lib/db';
import { isCloudDbEnabled } from '@/lib/cloudflareD1';
import { readCloudCustomers, writeCloudCustomers } from '@/lib/cloudData';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json(
        { success: false, message: '로그인이 필요한 서비스입니다.' },
        { status: 401 }
      );
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, message: '현재 비밀번호와 새 비밀번호를 모두 입력해 주세요.' },
        { status: 400 }
      );
    }

    const trimmedNewPassword = String(newPassword).trim();
    if (trimmedNewPassword.length < 2) {
      return NextResponse.json(
        { success: false, message: '비밀번호는 최소 2글자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    const { customers } = isCloudDbEnabled() ? { customers: await readCloudCustomers() } : readExcelData();
    const customer = customers.find(
      (c) => String(c.거래처명).trim().toLowerCase() === String(session.customerName).trim().toLowerCase()
    );

    if (!customer) {
      return NextResponse.json(
        { success: false, message: '존재하지 않는 거래처 정보입니다.' },
        { status: 404 }
      );
    }

    // Verify current password
    if (String(customer.접속코드 || '').trim() !== String(currentPassword).trim()) {
      return NextResponse.json(
        { success: false, message: '현재 비밀번호(접속코드)가 일치하지 않습니다.' },
        { status: 401 }
      );
    }

    // Update password
    customer.접속코드 = trimmedNewPassword;

    // Write back to Excel
    const cloudMode = isCloudDbEnabled();
    if (cloudMode) {
      await writeCloudCustomers(customers, false);
    }

    const success = cloudMode ? true : writeCustomers(customers);
    if (!success) {
      return NextResponse.json(
        { success: false, message: '비밀번호를 변경하는 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: '비밀번호가 정상적으로 변경되었습니다.' });
  } catch (error) {
    console.error('[Change Password API] Error:', error);
    return NextResponse.json(
      { success: false, message: '서버 내부 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
