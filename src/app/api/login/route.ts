import { NextRequest, NextResponse } from 'next/server';
import { readExcelData, getExcelPath, recordCustomerLogin } from '@/lib/db';
import { setAuthSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { customerName, password } = await request.json();
    
    console.log('[Login API] Attempting login with bypass enabled for:', { customerName });

    if (!customerName) {
      return NextResponse.json(
        { success: false, message: '거래처명을 입력해 주세요.' },
        { status: 400 }
      );
    }

    const excelPath = getExcelPath();
    const { customers } = readExcelData();
    
    console.log('[Login API] Excel Path:', excelPath);
    console.log('[Login API] Registered customers count in DB:', customers.length);

    const targetName = String(customerName).trim().toLowerCase();
    
    // Find customer by name (case-insensitive and trimmed)
    const customer = customers.find(
      (c) => String(c.거래처명).trim().toLowerCase() === targetName
    );

    if (!customer) {
      console.warn('[Login API] Customer name not found in database:', customerName);
      return NextResponse.json(
        { success: false, message: '등록되지 않은 거래처명입니다.' },
        { status: 401 }
      );
    }

    // Check block status
    if (customer.로그인차단 === 'y') {
      console.warn('[Login API] Blocked customer login attempt:', customerName);
      return NextResponse.json(
        { success: false, message: '로그인이 차단된 거래처입니다. 관리자에게 문의하세요.' },
        { status: 403 }
      );
    }

    // Verify password (접속코드)
    const targetPassword = String(password || '').trim();
    const dbPassword = String(customer.접속코드 || '').trim();

    if (!targetPassword) {
      return NextResponse.json(
        { success: false, message: '비밀번호(접속코드)를 입력해 주세요.' },
        { status: 400 }
      );
    }

    if (targetPassword !== dbPassword) {
      console.warn('[Login API] Invalid password for customer:', customerName);
      return NextResponse.json(
        { success: false, message: '비밀번호(접속코드)가 일치하지 않습니다.' },
        { status: 401 }
      );
    }

    console.log('[Login API] Authentication success for:', customer.거래처명);

    // Record login timestamp and log entry in database
    recordCustomerLogin(customer.거래처명);

    // Set session cookie
    const success = await setAuthSession({
      customerName: customer.거래처명,
      discountGrade: customer.거래처등급,
    });

    if (!success) {
      return NextResponse.json(
        { success: false, message: '세션 생성에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      customerName: customer.거래처명,
      discountGrade: customer.거래처등급,
    });
  } catch (error) {
    console.error('[Login API] Error occurred:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
