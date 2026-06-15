import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDbPath } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const week = searchParams.get('week');
  const code = searchParams.get('code');
  const file = searchParams.get('file');
  const debug = searchParams.get('debug') === 'true';

  try {
    if (!week || !code) {
      if (debug) {
        return NextResponse.json({ status: 'error', message: 'Missing week or code query parameters' });
      }
      return new NextResponse('Bad Request: Missing week or code', { status: 400 });
    }

    const dbPath = getDbPath();
    let targetDir = path.resolve(dbPath, week, code);
    let targetDirExists = fs.existsSync(targetDir);

    // Fallback: If Z drive path does not contain the folder, try local pddb_dev path
    if (!targetDirExists) {
      const localDbPath = path.join(process.cwd(), 'pddb_dev');
      const localTargetDir = path.resolve(localDbPath, week, code);
      if (fs.existsSync(localTargetDir)) {
        targetDir = localTargetDir;
        targetDirExists = true;
        console.log(`[Image API] Serving from local fallback path: ${targetDir}`);
      }
    }

    const findValidImage = (dirPath: string, files: string[]): string | undefined => {
      return files.find(f => {
        if (f.startsWith('0')) return false; // '0'으로 시작하는 파일명(예: 0.jpg)은 대표 이미지에서 제외
        const ext = path.extname(f).toLowerCase();
        const isImg = ext === '.jpg' || ext === '.jpeg' || ext === '.png';
        if (!isImg) return false;
        try {
          const filePath = path.join(dirPath, f);
          const stats = fs.statSync(filePath);
          return stats.isFile() && stats.size > 2048; // Exclude mock 134 bytes files
        } catch {
          return false;
        }
      });
    };

    let filesInDir: string[] = [];
    if (targetDirExists) {
      try {
        filesInDir = fs.readdirSync(targetDir);
      } catch (err: any) {
        console.error('Error reading dir files:', err.message);
      }
    }

    // Find the first valid image file in the folder
    let imageFile = findValidImage(targetDir, filesInDir);

    // If folder doesn't exist, or folder exists but contains no valid image files
    if (!targetDirExists || !imageFile) {
      const fallbackDir = path.resolve(dbPath, week, code + '_temp_refresh');
      if (fs.existsSync(fallbackDir)) {
        try {
          // Attempt recovery: rename temp folder to target code name
          fs.renameSync(fallbackDir, targetDir);
          targetDirExists = true;
          filesInDir = fs.readdirSync(targetDir);
          imageFile = findValidImage(targetDir, filesInDir);
          console.log(`[Image API] Auto-recovered: Renamed ${code}_temp_refresh to ${code}`);
        } catch (renameErr: any) {
          // If rename fails (locked/Junction), serve directly from fallback folder
          targetDir = fallbackDir;
          targetDirExists = true;
          try {
            filesInDir = fs.readdirSync(targetDir);
            imageFile = findValidImage(targetDir, filesInDir);
          } catch (readErr) {
            console.error('[Image API] Failed to read fallback folder:', readErr);
          }
          console.warn(`[Image API] Serving from temp folder due to lock: ${code}_temp_refresh`);
        }
      }
    }

    let targetFilePath = '';
    let selectedBy = 'none';

    if (file) {
      targetFilePath = path.join(targetDir, file);
      selectedBy = 'explicit_param';
      
      // Fallback: If target file does not exist in targetDir but exists in _temp_refresh folder
      if (!fs.existsSync(targetFilePath)) {
        const fallbackDir = path.resolve(dbPath, week, code + '_temp_refresh');
        const fallbackFilePath = path.join(fallbackDir, file);
        if (fs.existsSync(fallbackFilePath)) {
          targetDir = fallbackDir;
          targetFilePath = fallbackFilePath;
          targetDirExists = true;
          console.log(`[Image API] File fallback to temp folder successful: ${targetFilePath}`);
        }
      }
    } else if (targetDirExists && imageFile) {
      targetFilePath = path.join(targetDir, imageFile);
      selectedBy = 'auto_first_match';
    }

    const targetFileExists = targetFilePath ? fs.existsSync(targetFilePath) : false;
    const isFile = targetFileExists ? fs.statSync(targetFilePath).isFile() : false;
    const isLargeEnough = (targetFileExists && isFile) ? fs.statSync(targetFilePath).size > 2048 : false;

    // Security Checks
    const resolvedDbPath = path.resolve(dbPath);
    const securityCheck1 = targetDir.startsWith(resolvedDbPath);
    const securityCheck2 = targetFilePath ? targetFilePath.startsWith(targetDir) : false;
    const passesSecurity = securityCheck1 && (file ? securityCheck2 : true);

    // If debug is requested, return JSON info instead of streaming bytes
    if (debug) {
      return NextResponse.json({
        debug: true,
        dbPath,
        resolvedTargetDir: targetDir,
        targetDirExists,
        filesInDir,
        selectedBy,
        resolvedFilePath: targetFilePath,
        targetFileExists,
        isFile,
        isLargeEnough,
        securityChecks: {
          passesSecurity,
          securityCheck1_DirUnderDbPath: securityCheck1,
          securityCheck2_FileUnderTargetDir: securityCheck2,
        }
      });
    }

    // Normal streaming behavior
    if (!targetDirExists || !passesSecurity || !targetFilePath || !targetFileExists || !isFile || !isLargeEnough) {
      return servePlaceholder();
    }

    const ext = path.extname(targetFilePath).toLowerCase();
    const isVideo = ext === '.mp4' || ext === '.webm';
    let contentType = 'image/jpeg';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.mp4') contentType = 'video/mp4';
    else if (ext === '.webm') contentType = 'video/webm';

    // HTTP Range Requests for video streaming (needed for Safari and smooth controls)
    const range = request.headers.get('range');
    if (isVideo && range) {
      const stats = fs.statSync(targetFilePath);
      const fileSize = stats.size;
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        return new Response('Requested Range Not Satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${fileSize}` }
        });
      }

      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(targetFilePath, { start, end });

      const stream = new ReadableStream({
        start(controller) {
          fileStream.on('data', (chunk) => controller.enqueue(chunk));
          fileStream.on('end', () => controller.close());
          fileStream.on('error', (err) => controller.error(err));
        },
        cancel() {
          fileStream.destroy();
        }
      });

      return new Response(stream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': contentType,
        }
      });
    }

    const fileBuffer = fs.readFileSync(targetFilePath);

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
        'Accept-Ranges': isVideo ? 'bytes' : 'none',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      },
    });
  } catch (error: any) {
    console.error('Image Serving API error:', error);
    if (debug) {
      return NextResponse.json({ status: 'error', message: error.message });
    }
    return new Response('Internal Server Error', { status: 500 });
  }
}

// Fallback nice placeholder SVG when image is not found
function servePlaceholder() {
  const placeholderSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
      <rect width="100%" height="100%" fill="#f7f7f7" />
      <g transform="translate(0, 180)">
        <text x="50%" y="0" dominant-baseline="middle" text-anchor="middle" font-family="serif" font-size="14" fill="#a0a0a0" letter-spacing="2">U & M E</text>
        <text x="50%" y="25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#c0c0c0" letter-spacing="1">Preparing Image</text>
      </g>
    </svg>
  `;
  
  return new Response(placeholderSvg.trim(), {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    },
  });
}
