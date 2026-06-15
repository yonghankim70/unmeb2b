import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';
import { getDbPath, readExcelData, writeProducts, Product, readGlobalSettings } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function performSync() {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    return {
      success: false,
      message: '데이터베이스 경로가 존재하지 않습니다.',
      diagnostics: { dbPath, dbPathExists: false }
    };
  }

  const items = fs.readdirSync(dbPath);
  const weekDirs = items.filter(item => {
    const fullPath = path.join(dbPath, item);
    if (!fs.statSync(fullPath).isDirectory()) return false;
    if (item.startsWith('.')) return false;
    
    // Only scan folders matching the week/season pattern (e.g., 23W, 24S)
    const isWeekPattern = /^\d{2}[a-zA-Z]+/.test(item);
    return isWeekPattern;
  });

  const foundProducts: { week: string; code: string; buyerInfo: string }[] = [];

  // Scan week directories for product folders
  for (const week of weekDirs) {
    const weekPath = path.join(dbPath, week);
    const subItems = fs.readdirSync(weekPath);
    
    for (const item of subItems) {
      let folderCode = item;
      let itemPath = path.join(weekPath, item);
      if (!fs.statSync(itemPath).isDirectory()) continue;
      if (item.startsWith('.')) continue;

      // Rename directory on disk to remove _temp_refresh if present
      if (item.endsWith('_temp_refresh')) {
        const cleaned = item.replace(/_temp_refresh$/, '');
        const cleanedPath = path.join(weekPath, cleaned);
        try {
          if (!fs.existsSync(cleanedPath)) {
            fs.renameSync(itemPath, cleanedPath);
            folderCode = cleaned;
            itemPath = cleanedPath;
            console.log(`[Sync] Renamed folder ${item} to ${cleaned}`);
          } else {
            console.warn(`[Sync] Cleaned folder path already exists: ${cleanedPath}`);
            folderCode = cleaned;
            itemPath = cleanedPath;
          }
        } catch (renameErr) {
          console.error(`[Sync] Failed to rename folder ${itemPath} to ${cleanedPath}:`, renameErr);
        }
      }

      // Find text file for buyerInfo
      const files = fs.readdirSync(itemPath);
      const txtFile = files.find(f => path.extname(f).toLowerCase() === '.txt');
      
      let buyerInfo = '';
      if (txtFile) {
        try {
          buyerInfo = fs.readFileSync(path.join(itemPath, txtFile), 'utf-8').trim();
        } catch (err) {
          console.error(`[Sync] Failed to read txt file in ${itemPath}`, err);
        }
      }

      foundProducts.push({
        week,
        code: folderCode,
        buyerInfo,
      });
    }
  }

  // Read existing Excel database
  const { products: existingProducts, items: itemsLookup, categories: categoriesLookup } = readExcelData();
  const existingCodes = new Set(existingProducts.map(p => (p.임시코드 || p.상품명 || '').toLowerCase().trim()));

  // Prepare item master suffix sorting
  const sortedItems = [...itemsLookup].sort((a, b) => {
    const aAbbr = a.아이템.match(/^([^(]+)/)?.[1] || '';
    const bAbbr = b.아이템.match(/^([^(]+)/)?.[1] || '';
    return bAbbr.length - aAbbr.length;
  });

  // Find default category exchange rates and logistics costs from global settings
  const globalSettings = readGlobalSettings();
  const initialExchange = globalSettings.exchange;
  const initialLogistics = globalSettings.logistics;

  // Find products that do not exist in Excel
  const newProductsToAppend: Product[] = [];
  const addedCodes: string[] = [];

  // 한국 시간대(KST, UTC+9) 기준 현재 날짜 MMDD 포맷팅 ("0613" 등)
  const kstOffset = 9 * 60 * 60 * 1000;
  const nowKst = new Date(Date.now() + kstOffset);
  const mm = String(nowKst.getMonth() + 1).padStart(2, '0');
  const dd = String(nowKst.getDate()).padStart(2, '0');
  const todayPrefix = `${mm}${dd}-`; // "0613-"

  // 기존 DB/엑셀 데이터를 확인하여 오늘 접두사로 시작하는 최대 일련번호 N을 탐색
  let maxSeq = 0;
  for (const p of existingProducts) {
    const syncTime = p.동기화시간 || '';
    if (syncTime.startsWith(todayPrefix)) {
      const seqStr = syncTime.substring(todayPrefix.length); // "0613-1" -> "1"
      const seq = parseInt(seqStr, 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }
  const nextSeq = maxSeq + 1;
  const formattedSyncTime = `${todayPrefix}${nextSeq}`; // 예: "0613-1"


  for (const found of foundProducts) {
    const normalizedCode = found.code.toLowerCase().trim();
    if (!existingCodes.has(normalizedCode)) {
      // Perform suffix matching for items
      let matchedItem = '';
      const folderLower = found.code.toLowerCase().trim();
      for (const item of sortedItems) {
        const match = item.아이템.match(/^([^(]+)/);
        if (match) {
          const abbr = match[1].toLowerCase().trim();
          if (folderLower.endsWith(abbr)) {
            matchedItem = item.아이템;
            break;
          }
        }
      }

      newProductsToAppend.push({
        업로드일자: '',
        노출여부: 'n', // default is 'n' (non-exposed) as per rules
        카테고리: '신상',
        주차: found.week,
        상품명: found.code, // initial name is the folder name
        임시코드: found.code, // immutable code is folder name
        아이템: matchedItem,
        컬러: '',
        사이즈: 'free',
        단가: 0,
        환율: initialExchange,
        물류비: initialLogistics,
        원가: 0,
        도매가: 0,
        S등급가: 0,
        A등급: 0,
        B등급: 0,
        C등급: 0,
        사입처: found.buyerInfo,
        중국코드: '',
        신규등록대기: true,
        등급할인제외: '',
        동기화시간: formattedSyncTime,
      });
      addedCodes.push(found.code);
    }
  }

  let writeSuccess = true;

  // Write back to Excel if there are new products
  if (newProductsToAppend.length > 0) {
    writeSuccess = writeProducts(newProductsToAppend);
  }

  return {
    success: writeSuccess,
    message: writeSuccess 
      ? `동기화 완료: ${newProductsToAppend.length}개 추가됨` 
      : '엑셀 데이터베이스 쓰기 중 오류가 발생했습니다 (엑셀이 켜져 있는지 확인하세요).',
    addedCount: newProductsToAppend.length,
    addedProducts: addedCodes,
    totalScanned: foundProducts.length,
    diagnostics: {
      dbPath,
      scannedWeekFolders: weekDirs,
      allDetectedProductFolders: foundProducts,
      existingProductCodesInExcel: Array.from(existingCodes),
      newProductsToAppend,
      writeSuccess
    }
  };
}

// Support POST requests from buttons
export async function POST(request: NextRequest) {
  try {
    const result = await performSync();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Sync API POST error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// Support GET requests for easy browser diagnostic checks
export async function GET(request: NextRequest) {
  try {
    const result = await performSync();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Sync API GET error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
