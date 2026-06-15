import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';
import { getProductsDbPath, getExcelPath, Product, formatProduct } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const jsonPath = getProductsDbPath();
    const excelPath = getExcelPath();
    const results: any = {};

    if (!fs.existsSync(jsonPath)) {
      return NextResponse.json({ success: false, message: 'products_db.json not found' });
    }

    // 1. JSON 파일 로드 및 복구
    const fileContent = fs.readFileSync(jsonPath, 'utf-8');
    const products = JSON.parse(fileContent) as any[];

    const updatedProducts = products.map(p => {
      const code = (p.상품명 || p.임시코드 || '').trim();
      
      if (code === 'BD0608-05') {
        return {
          ...p,
          단가: 31,
          환율: 230,
          물류비: 1200,
          원가: 31 * 230 + 1200, // 8330이지만, 도매가는 11000 등으로 오전에 저장하셨던 데이터 매칭
          도매가: 11000,
          S등급가: 9400,
          A등급: 9800,
          B등급: 10200,
          C등급: 10700,
          노출여부: 'y', // 노출여부 'y'로 원복
          신규등록대기: false
        };
      } else if (code === 'BD0608-06') {
        return {
          ...p,
          단가: 30,
          환율: 230,
          물류비: 1200,
          원가: 30 * 230 + 1200, // 8100이지만, 도매가는 11000 등으로 매칭
          도매가: 11000,
          S등급가: 9400,
          A등급: 9800,
          B등급: 10200,
          C등급: 10700,
          노출여부: 'y', // 노출여부 'y'로 원복
          신규등록대기: false
        };
      } else {
        // 단가가 0인 다른 제품들은 가격을 전부 0으로 복원하여 가짜 2000원 하드코딩 제거
        const dan = Number(p.단가) || 0;
        if (dan === 0) {
          return {
            ...p,
            도매가: 0,
            S등급가: 0,
            A등급: 0,
            B등급: 0,
            C등급: 0,
            원가: 0
          };
        }
      }
      return p;
    });

    // JSON 파일에 덮어쓰기
    fs.writeFileSync(jsonPath, JSON.stringify(updatedProducts.map(p => formatProduct(p)), null, 2), 'utf-8');
    results.jsonRestore = 'Success';

    // 2. Excel (Master.xlsx) 의 상품 마스터에도 동일하게 반영하여 싱크 일치
    if (fs.existsSync(excelPath)) {
      try {
        const fileBuffer = fs.readFileSync(excelPath);
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        
        const formatted = updatedProducts.map(p => formatProduct(p));
        const productSheet = xlsx.utils.json_to_sheet(formatted);
        
        workbook.Sheets['상품 마스터'] = productSheet;
        if (!workbook.SheetNames.includes('상품 마스터')) {
          workbook.SheetNames.push('상품 마스터');
        }
        
        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        fs.writeFileSync(excelPath, buffer);
        results.excelRestore = 'Success';
      } catch (err: any) {
        results.excelRestore = `Error: ${err.message}`;
      }
    } else {
      results.excelRestore = 'Master.xlsx not found';
    }

    return NextResponse.json({
      success: true,
      results,
      updatedSample: updatedProducts.map(p => ({
        상품명: p.상품명,
        단가: p.단가,
        도매가: p.도매가,
        A등급: p.A등급
      }))
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: error.message
    });
  }
}
