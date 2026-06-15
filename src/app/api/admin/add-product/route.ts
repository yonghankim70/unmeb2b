import { NextRequest, NextResponse } from 'next/server';
import { readProductsDb, saveProducts } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const newProduct = await request.json();

    if (!newProduct || !newProduct.상품명 || !newProduct.임시코드 || !newProduct.주차) {
      return NextResponse.json({ success: false, message: '상품명, 임시코드, 주차는 필수 필드입니다.' }, { status: 400 });
    }

    const products = readProductsDb();
    
    // Check duplication
    const exists = products.some(p => 
      (p.임시코드 || p.상품명 || '').toLowerCase().trim() === newProduct.임시코드.toLowerCase().trim()
    );

    if (exists) {
      return NextResponse.json({ success: false, message: '이미 존재하는 임시코드입니다.' }, { status: 400 });
    }

    // Append new product
    const updated = [newProduct, ...products];
    const success = saveProducts(updated);

    if (success) {
      return NextResponse.json({ success: true, message: '상품 추가 성공' });
    } else {
      return NextResponse.json({ success: false, message: 'JSON 파일 저장에 실패했습니다.' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[Add Product API] Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
