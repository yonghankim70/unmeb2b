import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDbPath } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const week = searchParams.get('week');
    const code = searchParams.get('code');

    if (!week || !code) {
      return NextResponse.json({ success: false, message: 'Missing week or code' }, { status: 400 });
    }

    const dbPath = getDbPath();
    let targetDir = path.resolve(dbPath, week, code);
    let targetDirExists = fs.existsSync(targetDir);

    console.log(`[ProductDetails API] Request - week: ${week}, code: ${code}, targetDirExists: ${targetDirExists}`);

    // Fallback: Check if Z drive path does not contain the folder, try local pddb_dev path
    if (!targetDirExists) {
      const localDbPath = path.join(process.cwd(), 'pddb_dev');
      const localTargetDir = path.resolve(localDbPath, week, code);
      if (fs.existsSync(localTargetDir)) {
        targetDir = localTargetDir;
        targetDirExists = true;
      }
    }

    // Fallback: Check if _temp_refresh folder exists when normal folder doesn't exist
    if (!targetDirExists) {
      const fallbackDir = path.resolve(dbPath, week, code + '_temp_refresh');
      if (fs.existsSync(fallbackDir)) {
        targetDir = fallbackDir;
        targetDirExists = true;
      }
    }

    // Security Check
    if (!targetDir.startsWith(path.resolve(dbPath)) && !targetDir.startsWith(path.resolve(path.join(process.cwd(), 'pddb_dev')))) {
      return NextResponse.json({ success: false, message: 'Access Denied' }, { status: 403 });
    }

    if (!targetDirExists) {
      return NextResponse.json({ success: true, images: [] });
    }

    let files = fs.readdirSync(targetDir);
    
    // Scan for both image and video files
    let images = files.filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.mp4' || ext === '.webm';
    }).sort();

    // Fallback: If folder exists but contains 0 files, try _temp_refresh folder
    if (images.length === 0) {
      const fallbackDir = path.resolve(dbPath, week, code + '_temp_refresh');
      if (fs.existsSync(fallbackDir)) {
        console.log(`[ProductDetails API] Primary folder has 0 assets. Falling back to: ${fallbackDir}`);
        try {
          const fallbackFiles = fs.readdirSync(fallbackDir);
          const fallbackImages = fallbackFiles.filter(f => {
            const ext = path.extname(f).toLowerCase();
            return ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.mp4' || ext === '.webm';
          }).sort();
          if (fallbackImages.length > 0) {
            images = fallbackImages;
          }
        } catch (err) {
          console.error('[ProductDetails API] Failed to read fallbackDir:', err);
        }
      }
    }

    console.log(`[ProductDetails API] Returning ${images.length} images for ${code}`);

    // Security: Do NOT scan or return buyerInfo (사입처) to the client-side API
    return NextResponse.json({
      success: true,
      images
    });

  } catch (error: any) {
    console.error('Product details API error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
