import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDbPath } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const week = formData.get('week') as string;
    const code = formData.get('code') as string;
    const file = formData.get('file') as File;

    if (!week || !code || !file) {
      return NextResponse.json({ success: false, message: '필수 매개변수(week, code, file)가 누락되었습니다.' }, { status: 400 });
    }

    const dbPath = getDbPath();
    const targetDir = path.resolve(dbPath, week, code);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Sanitize spaces in file names
    const fileName = file.name.replace(/\s+/g, '_');
    const targetFilePath = path.join(targetDir, fileName);

    fs.writeFileSync(targetFilePath, buffer);
    console.log(`[Upload API] Image saved successfully to ${targetFilePath}`);

    return NextResponse.json({ success: true, message: '이미지 업로드 완료', fileName });
  } catch (error: any) {
    console.error('[Upload API] Error saving image:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
