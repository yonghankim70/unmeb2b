import { NextRequest, NextResponse } from 'next/server';
import { readExcelData, saveColorsToExcel, ColorMaster } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { color, label } = await request.json();
    
    if (!color || !label) {
      return NextResponse.json({ success: false, message: '컬러 코드와 표기명이 필요합니다.' }, { status: 400 });
    }

    // 1. 기존 데이터 읽기
    const data = readExcelData();
    const existingColors = data.colors || [];

    // 중복 체크
    const isDuplicate = existingColors.some(
      c => c.컬러.toLowerCase().trim() === color.toLowerCase().trim()
    );

    if (isDuplicate) {
      return NextResponse.json({ success: false, message: '이미 존재하는 컬러입니다.' }, { status: 400 });
    }

    // 2. 새 컬러 추가
    const newColorItem: ColorMaster = {
      컬러: color.trim(),
      표기컬러: label.trim(),
    };

    const updatedColors = [...existingColors, newColorItem];
    const success = saveColorsToExcel(updatedColors);

    if (!success) {
      return NextResponse.json({ success: false, message: '컬러 엑셀 마스터 저장 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, color: newColorItem, colors: updatedColors });
  } catch (error: any) {
    console.error('[Admin Colors API POST] 에러 발생:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
