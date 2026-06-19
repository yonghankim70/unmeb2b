import { NextRequest, NextResponse } from 'next/server';
import { readExcelData, saveColorsToExcel, ColorMaster } from '@/lib/db';
import { isAdminAuthenticated } from '@/lib/adminAuth';
import { isCloudDbEnabled, queryD1 } from '@/lib/cloudflareD1';
import { readCloudColors } from '@/lib/cloudData';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json({ success: false, message: '관리자 로그인이 필요합니다.' }, { status: 401 });
    }

    const { color, label } = await request.json();
    
    if (!color || !label) {
      return NextResponse.json({ success: false, message: '컬러 코드와 표기명이 필요합니다.' }, { status: 400 });
    }

    const trimmedColor = color.trim();
    const trimmedLabel = label.trim();
    const normalizedColor = trimmedColor.toLowerCase();

    // 1. 기존 데이터 읽기
    const existingColors = isCloudDbEnabled()
      ? await readCloudColors()
      : (readExcelData().colors || []);

    // 중복 체크
    const isDuplicate = existingColors.some(
      c => c.컬러.toLowerCase().trim() === normalizedColor
    );

    if (isDuplicate) {
      return NextResponse.json({ success: false, message: '이미 존재하는 컬러입니다.' }, { status: 400 });
    }

    // 2. 새 컬러 추가
    const newColorItem: ColorMaster = {
      컬러: trimmedColor,
      표기컬러: trimmedLabel,
    };

    const updatedColors = [...existingColors, newColorItem].sort((left, right) =>
      String(left.컬러 || '').localeCompare(String(right.컬러 || ''), 'ko-KR', { numeric: true, sensitivity: 'base' })
    );

    if (isCloudDbEnabled()) {
      const rows = await queryD1<{ payload?: string }>('SELECT payload FROM colors WHERE lower(name) = lower(?) LIMIT 1', [trimmedColor]);
      if (rows.length > 0) {
        return NextResponse.json({ success: false, message: '이미 존재하는 컬러입니다.' }, { status: 400 });
      }

      await queryD1(
        'INSERT OR REPLACE INTO colors (name, payload, updated_at) VALUES (?, ?, ?)',
        [trimmedColor, JSON.stringify(newColorItem), new Date().toISOString()]
      );
    }

    if (!isCloudDbEnabled()) {
      const success = saveColorsToExcel(updatedColors);
      if (!success) {
        return NextResponse.json({ success: false, message: '컬러 엑셀 마스터 저장 중 오류가 발생했습니다.' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, color: newColorItem, colors: updatedColors });
  } catch (error: any) {
    console.error('[Admin Colors API POST] 에러 발생:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
