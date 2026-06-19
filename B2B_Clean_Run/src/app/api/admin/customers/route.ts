import { NextRequest, NextResponse } from 'next/server';
import { readCustomersDb, writeCustomers, readAllLoginLogs } from '@/lib/db';
import type { Customer } from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/adminAuth';
import { isCloudDbEnabled, queryD1 } from '@/lib/cloudflareD1';
import { deleteCloudCustomers, readCloudCustomers, readCloudGlobalSettings, writeCloudCustomers } from '@/lib/cloudData';

export const dynamic = 'force-dynamic';

function customerKey(customer: Customer): string {
  return String(customer.거래처명 || '').trim();
}

function normalizeNames(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function findDuplicateCustomerNames(customers: Customer[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const customer of customers) {
    const key = customerKey(customer).toLowerCase();
    if (!key) continue;
    if (seen.has(key)) {
      duplicates.add(customerKey(customer));
    }
    seen.add(key);
  }

  return Array.from(duplicates);
}

function mergeCustomers(currentCustomers: Customer[], changedCustomers: Customer[], deletedCustomerNames: string[]): Customer[] {
  const changedByName = new Map(changedCustomers.map((customer) => [customerKey(customer).toLowerCase(), customer]));
  const deletedNames = new Set(deletedCustomerNames.map((name) => name.toLowerCase()));
  const existingNames = new Set<string>();

  const merged = currentCustomers
    .filter((customer) => !deletedNames.has(customerKey(customer).toLowerCase()))
    .map((customer) => {
      const key = customerKey(customer).toLowerCase();
      existingNames.add(key);
      return changedByName.get(key) || customer;
    });

  for (const customer of changedCustomers) {
    const key = customerKey(customer).toLowerCase();
    if (!key || deletedNames.has(key) || existingNames.has(key)) continue;
    merged.push(customer);
  }

  return merged;
}

export async function GET(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    const cloudMode = isCloudDbEnabled();
    const customers = cloudMode ? await readCloudCustomers() : readCustomersDb();
    const globalSettings = cloudMode ? await readCloudGlobalSettings() : null;
    const loginLogs = cloudMode ? [] : readAllLoginLogs(startDate, endDate);

    const logsByCustomer = new Map<string, string[]>();
    for (const log of loginLogs) {
      const entries = logsByCustomer.get(log.거래처명) || [];
      entries.push(log.접속일시);
      logsByCustomer.set(log.거래처명, entries);
    }

    // Map logs to customers
    const customersWithLogs = customers.map(c => {
      const customerLogs = logsByCustomer.get(c.거래처명) || [];
      return {
        ...c,
        접속횟수: customerLogs.length,
        접속기록: customerLogs
      };
    });

    return NextResponse.json({
      success: true,
      customers: customersWithLogs,
      globalSettings,
    });
  } catch (error: any) {
    console.error('[Admin Customers API GET] Error:', error);
    return NextResponse.json(
      { success: false, message: '거래처 데이터를 읽어오는 도중 서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const customers = Array.isArray(body.customers) ? body.customers as Customer[] : [];
    const deletedCustomerNames = normalizeNames(body.deletedCustomerNames);

    if (customers.length === 0 && deletedCustomerNames.length === 0) {
      return NextResponse.json(
        { success: false, message: '반영할 거래처 변경사항이 없습니다.' },
        { status: 400 }
      );
    }

    const invalidCustomers = customers.filter((customer) => !customerKey(customer));
    if (invalidCustomers.length > 0) {
      return NextResponse.json(
        { success: false, message: '거래처명은 빈칸으로 저장할 수 없습니다.' },
        { status: 400 }
      );
    }

    const duplicates = findDuplicateCustomerNames(customers);
    if (duplicates.length > 0) {
      return NextResponse.json(
        { success: false, message: `중복된 거래처명이 있습니다: ${duplicates.join(', ')}` },
        { status: 400 }
      );
    }

    const cloudMode = isCloudDbEnabled();
    let savedCustomerCount = 0;
    let deletedCustomerCount = 0;

    if (cloudMode) {
      if (body.replaceAllCustomers !== false) {
        return NextResponse.json(
          { success: false, message: '운영 서버에서는 거래처 전체 덮어쓰기를 사용할 수 없습니다. 수정/추가/삭제분만 반영합니다.' },
          { status: 409 }
        );
      }

      await writeCloudCustomers(customers, false);
      savedCustomerCount = customers.length;

      if (deletedCustomerNames.length > 0) {
        const countRows = await queryD1<{ count: number }>('SELECT COUNT(*) as count FROM customers');
        const existingCount = Number(countRows[0]?.count || 0);
        const largeDeleteLimit = Math.max(20, Math.floor(existingCount * 0.5));

        if (!body.confirmLargeDelete && existingCount > 0 && deletedCustomerNames.length > largeDeleteLimit) {
          return NextResponse.json(
            {
              success: false,
              message: `거래처 ${deletedCustomerNames.length}개 삭제 요청이 차단되었습니다. 현재 거래처 ${existingCount}개 대비 삭제량이 큽니다.`,
            },
            { status: 409 }
          );
        }

        await deleteCloudCustomers(deletedCustomerNames);
        deletedCustomerCount = deletedCustomerNames.length;
      }
    }

    let success = true;
    if (!cloudMode) {
      success = writeCustomers(mergeCustomers(readCustomersDb(), customers, deletedCustomerNames));
      savedCustomerCount = customers.length;
      deletedCustomerCount = deletedCustomerNames.length;
    }

    if (!success) {
      return NextResponse.json(
        { success: false, message: '거래처 데이터베이스 저장 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '거래처 마스터 정보가 성공적으로 데이터베이스에 저장되었습니다.',
      savedCustomerCount,
      deletedCustomerCount,
    });
  } catch (error: any) {
    console.error('[Admin Customers API POST] Error:', error);
    return NextResponse.json(
      { success: false, message: error?.message || '서버 오류로 거래처 저장을 실패했습니다.' },
      { status: 500 }
    );
  }
}
