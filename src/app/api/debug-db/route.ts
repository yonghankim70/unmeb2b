import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

async function performScan() {
  const brainId = 'd3603749-8bde-4921-877c-974e4ca79e10';
  const brainDir = `C:\\Users\\yongh\\.gemini\\antigravity\\brain\\${brainId}`;
  const logsDir = path.join(brainDir, '.system_generated', 'logs');
  const tasksDir = path.join(brainDir, '.system_generated', 'tasks');

  const matchedProducts: any[] = [];
  const scanSummary: string[] = [];

  // 1. transcript.jsonl 탐색
  const transcriptPath = path.join(logsDir, 'transcript.jsonl');
  if (fs.existsSync(transcriptPath)) {
    const stats = fs.statSync(transcriptPath);
    scanSummary.push(`transcript.jsonl size: ${stats.size} bytes`);
    
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.split('\n');
    let foundInTranscript = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if ((line.includes('BC0603') || line.includes('BD0608')) && line.includes('단가')) {
        // 단가가 0이 아닌 값을 찾음 (숫자가 0보다 큰가?)
        const match = line.match(/"단가"\s*:\s*([1-9]\d*)/);
        if (match) {
          foundInTranscript++;
          const startIdx = line.indexOf('[');
          const endIdx = line.lastIndexOf(']');
          if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            const jsonStr = line.substring(startIdx, endIdx + 1);
            try {
              const unescaped = jsonStr.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
              const parsed = JSON.parse(unescaped);
              if (Array.isArray(parsed)) {
                const nonZero = parsed.filter((p: any) => (Number(p.단가) || 0) > 0);
                if (nonZero.length > 0) {
                  matchedProducts.push({
                    source: `transcript.jsonl line ${i + 1}`,
                    nonZeroCount: nonZero.length,
                    products: nonZero.map(p => ({ 상품명: p.상품명, 단가: p.단가, 도매가: p.도매가, A등급: p.A등급 || p['A등급가'] }))
                  });
                }
              }
            } catch (e: any) {
              // regex fallback
              const unescaped = jsonStr.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
              const regex = /{[\s\S]*?"상품명"\s*:\s*"([^"]+)"[\s\S]*?"단가"\s*:\s*([1-9]\d*)[\s\S]*?}/g;
              let m;
              const localFound = [];
              while ((m = regex.exec(unescaped)) !== null) {
                localFound.push({ 상품명: m[1], 단가: Number(m[2]) });
              }
              if (localFound.length > 0) {
                matchedProducts.push({
                  source: `transcript.jsonl line ${i + 1} (regex)`,
                  nonZeroCount: localFound.length,
                  products: localFound
                });
              }
            }
          }
        }
      }
    }
    scanSummary.push(`Found ${foundInTranscript} matches in transcript.jsonl`);
  } else {
    scanSummary.push('transcript.jsonl not found');
  }

  // 2. tasks/*.log 탐색
  if (fs.existsSync(tasksDir)) {
    const logFiles = fs.readdirSync(tasksDir).filter(f => f.endsWith('.log'));
    scanSummary.push(`Found ${logFiles.length} log files in tasks dir`);

    let logMatchCount = 0;
    for (const logFile of logFiles) {
      const logPath = path.join(tasksDir, logFile);
      const content = fs.readFileSync(logPath, 'utf-8');
      
      if ((content.includes('BC0603') || content.includes('BD0608')) && content.includes('단가')) {
        logMatchCount++;
        const lines = content.split('\n');
        const foundInLog: any[] = [];
        
        lines.forEach((l, idx) => {
          const fmt1 = l.match(/\[([A-Z0-9\-]+)\]\s*단가\s*:\s*([1-9]\d*)/i);
          if (fmt1) {
            foundInLog.push({ 상품명: fmt1[1], 단가: Number(fmt1[2]) });
          }
          const fmt2 = l.match(/([A-Z0-9\-]+)\s*단가\s*:\s*([1-9]\d*)/i);
          if (fmt2 && !fmt1) {
            foundInLog.push({ 상품명: fmt2[1], 단가: Number(fmt2[2]) });
          }
          const fmt3 = l.match(/"상품명"\s*:\s*"([^"]+)"/);
          if (fmt3) {
            for (let k = 1; k <= 10 && idx + k < lines.length; k++) {
              const nextLine = lines[idx + k];
              const priceMatch = nextLine.match(/"단가"\s*:\s*([1-9]\d*)/);
              if (priceMatch) {
                foundInLog.push({ 상품명: fmt3[1], 단가: Number(priceMatch[1]) });
                break;
              }
            }
          }
        });

        if (foundInLog.length > 0) {
          matchedProducts.push({
            source: `tasks/${logFile}`,
            nonZeroCount: foundInLog.length,
            products: foundInLog
          });
        }
      }
    }
    scanSummary.push(`Scanned log files, found ${logMatchCount} files containing product codes and non-zero unit prices`);
  } else {
    scanSummary.push('tasks dir not found');
  }

  return {
    success: true,
    scanSummary,
    matchedProductsCount: matchedProducts.length,
    matchedProducts
  };
}

export async function GET() {
  try {
    const data = await performScan();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message });
  }
}

export async function POST() {
  try {
    const data = await performScan();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message });
  }
}
