import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';

export const dynamic = 'force-dynamic';

function searchFiles(dir: string, pattern: RegExp, maxDepth = 4, depth = 0): string[] {
  const results: string[] = [];
  if (depth > maxDepth) return results;
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch (e) {
        continue;
      }
      
      if (stat.isDirectory()) {
        if (file.toLowerCase() === 'node_modules' || file.toLowerCase() === '.git' || file.toLowerCase() === '.next') {
          continue;
        }
        results.push(...searchFiles(fullPath, pattern, maxDepth, depth + 1));
      } else {
        if (pattern.test(file)) {
          results.push(fullPath);
        }
      }
    }
  } catch (e) {}
  return results;
}

export async function GET() {
  try {
    const scanPaths = [
      'C:\\Users\\yongh\\Desktop',
      'C:\\Users\\yongh\\AppData\\Local\\Microsoft\\Office\\UnsavedFiles',
      'C:\\Users\\yongh\\AppData\\Roaming\\Microsoft\\Excel',
      'C:\\Users\\yongh\\AppData\\Local\\Temp',
      'Z:\\HDD1\\PDDB'
    ];

    const foundExcelFiles: string[] = [];
    const pattern = /master/i;

    for (const sp of scanPaths) {
      if (fs.existsSync(sp)) {
        foundExcelFiles.push(...searchFiles(sp, pattern, 4));
      }
    }

    // 휴지통 검색 추가
    const recycleBin = 'C:\\$Recycle.Bin';
    if (fs.existsSync(recycleBin)) {
      foundExcelFiles.push(...searchFiles(recycleBin, /xlsx|xls|json/i, 5));
    }

    const excelDetails: any[] = [];
    for (const filePath of foundExcelFiles) {
      try {
        const stat = fs.statSync(filePath);
        const detail: any = {
          path: filePath,
          size: stat.size,
          modified: stat.mtime.toLocaleString('ko-KR')
        };

        if (filePath.endsWith('.xlsx') || filePath.endsWith('.xls')) {
          const fileBuffer = fs.readFileSync(filePath);
          const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
          detail.sheets = workbook.SheetNames;
          
          if (workbook.Sheets['상품 마스터']) {
            const rows = xlsx.utils.sheet_to_json<any>(workbook.Sheets['상품 마스터']);
            detail.hasProductMaster = true;
            detail.rowCount = rows.length;
            detail.nonZeroSample = rows.filter(r => (Number(r.단가) || 0) > 0).map(r => ({
              상품명: r.상품명 || r.임시코드,
              단가: r.단가,
              도매가: r.도매가
            }));
          }
        } else if (filePath.endsWith('.json')) {
          const content = fs.readFileSync(filePath, 'utf-8');
          try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
              detail.isProductDbJson = true;
              detail.rowCount = parsed.length;
              detail.nonZeroSample = parsed.filter(p => (Number(p.단가) || 0) > 0).map(p => ({
                상품명: p.상품명,
                단가: p.단가,
                도매가: p.도매가
              }));
            }
          } catch(e) {}
        }
        excelDetails.push(detail);
      } catch (err: any) {
        excelDetails.push({ path: filePath, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      foundExcelFiles,
      excelDetails
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: error.message
    });
  }
}
