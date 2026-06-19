import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/adminAuth';
import { queryD1 } from '@/lib/cloudflareD1';

export const dynamic = 'force-dynamic';

interface CountRow {
  count: number;
}

async function getCount(tableName: string): Promise<number> {
  const rows = await queryD1<CountRow>(`SELECT COUNT(*) as count FROM ${tableName}`);
  return Number(rows[0]?.count || 0);
}

export async function GET() {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    const [
      productCount,
      customerCount,
      orderCount,
      categoryCount,
      itemCount,
      colorCount,
      paymentCount,
      cartCount,
      productSamples,
      customerSamples,
      orderSamples,
    ] = await Promise.all([
      getCount('products'),
      getCount('customers'),
      getCount('orders'),
      getCount('categories'),
      getCount('items'),
      getCount('colors'),
      getCount('payments'),
      getCount('cart_snapshots'),
      queryD1('SELECT code, week, name, category, item, color, price, exposure, owner_cart_visible FROM products ORDER BY updated_at DESC LIMIT 5'),
      queryD1('SELECT name, grade, owner_cart_allowed, login_blocked FROM customers ORDER BY updated_at DESC LIMIT 5'),
      queryD1('SELECT id, customer_name, product_code, color, quantity, amount, order_at FROM orders ORDER BY updated_at DESC LIMIT 5'),
    ]);

    return NextResponse.json({
      success: true,
      checkedAt: new Date().toISOString(),
      databaseId: process.env.CF_D1_DATABASE_ID,
      counts: {
        products: productCount,
        customers: customerCount,
        orders: orderCount,
        categories: categoryCount,
        items: itemCount,
        colors: colorCount,
        payments: paymentCount,
        cartSnapshots: cartCount,
      },
      samples: {
        products: productSamples,
        customers: customerSamples,
        orders: orderSamples,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cloudflare D1 확인 중 오류가 발생했습니다.';
    console.error('[Cloudflare Check API] Error:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
