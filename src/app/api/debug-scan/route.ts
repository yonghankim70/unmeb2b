import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const brainId = 'd3603749-8bde-4921-877c-974e4ca79e10';
    const brainDir = `C:\\Users\\yongh\\.gemini\\antigravity\\brain\\${brainId}`;
    const logsDir = path.join(brainDir, '.system_generated', 'logs');
    const tasksDir = path.join(brainDir, '.system_generated', 'tasks');

    const matchedProducts: any[] = [];
    const scanSummary: string[] = [];

    // 1. transcript.jsonl 탐색
    const transcriptPath = path.join(logsDir, 'transcript.jsonl');
    if (fs.existsSync(transcriptPath)) {
      scanSummary.push(`transcript.jsonl exists`);
      const content = fs.readFileSync(transcriptPath, 'utf-8');
      const lines = content.split('\n');
      
      let matchedLinesCount = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // 소문자로 변환하여 매칭 체크
        const lowerLine = line.toLowerCase();
        if (
          lowerLine.includes('bc0603') || 
          lowerLine.includes('bd0608') || 
          lowerLine.includes('bc0604') || 
          lowerLine.includes('bc0605') ||
          lowerLine.includes('st파스텔')
        ) {
          matchedLinesCount++;
          
          let decodedLine = line;
          try {
            decodedLine = line.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          } catch(e) {}
          
          decodedLine = decodedLine.replace(/\\u([0-9a-fA-F]{4})/g, (match, grp) => {
            try {
              return String.fromCharCode(parseInt(grp, 16));
            } catch(e) {
              return match;
            }
          });

          // 대소문자 구분 없이 상품명 매칭
          const nameMatches = [...decodedLine.matchAll(/"(?:상품명|임시코드)"\s*:\s*"([a-zA-Z0-9\-\s\uAC00-\uD7A3_]+)"/gi)];
          const productsFound: any[] = [];

          for (let mIdx = 0; mIdx < nameMatches.length; mIdx++) {
            const m = nameMatches[mIdx];
            const name = m[1];
            const startPos = m.index || 0;
            const endPos = (mIdx < nameMatches.length - 1) ? (nameMatches[mIdx + 1].index || decodedLine.length) : decodedLine.length;
            
            const subStr = decodedLine.substring(startPos, endPos);
            
            const danMatch = subStr.match(/"단가"\s*:\s*(\d+)/);
            const doMatch = subStr.match(/"도매가"\s*:\s*(\d+)/);
            const sMatch = subStr.match(/"S등급가"\s*:\s*(\d+)/) || subStr.match(/"S등급"\s*:\s*(\d+)/);
            const aMatch = subStr.match(/"A등급"\s*:\s*(\d+)/) || subStr.match(/"A등급가"\s*:\s*(\d+)/);
            const bMatch = subStr.match(/"B등급"\s*:\s*(\d+)/) || subStr.match(/"B등급가"\s*:\s*(\d+)/);
            const cMatch = subStr.match(/"C등급"\s*:\s*(\d+)/) || subStr.match(/"C등급가"\s*:\s*(\d+)/);
            const rateMatch = subStr.match(/"환율"\s*:\s*(\d+)/);
            const logisMatch = subStr.match(/"물류비"\s*:\s*(\d+)/);

            const dan = danMatch ? Number(danMatch[1]) : 0;
            if (dan > 0) {
              productsFound.push({
                상품명: name,
                단가: dan,
                환율: rateMatch ? Number(rateMatch[1]) : 0,
                물류비: logisMatch ? Number(logisMatch[1]) : 0,
                도매가: doMatch ? Number(doMatch[1]) : 0,
                S등급가: sMatch ? Number(sMatch[1]) : 0,
                A등급: aMatch ? Number(aMatch[1]) : 0,
                B등급: bMatch ? Number(bMatch[1]) : 0,
                C등급: cMatch ? Number(cMatch[1]) : 0
              });
            }
          }

          if (productsFound.length > 0) {
            matchedProducts.push({
              source: `transcript.jsonl line ${i + 1}`,
              products: productsFound
            });
          }
        }
      }
      scanSummary.push(`Checked transcript.jsonl. Matched lines containing codes: ${matchedLinesCount}`);
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
        const lowerContent = content.toLowerCase();
        
        if (
          lowerContent.includes('bc0603') || 
          lowerContent.includes('bd0608') || 
          lowerContent.includes('bc0604') || 
          lowerContent.includes('bc0605') ||
          lowerContent.includes('st파스텔')
        ) {
          logMatchCount++;
          
          let decodedContent = content;
          try {
            decodedContent = content.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          } catch(e) {}
          
          decodedContent = decodedContent.replace(/\\u([0-9a-fA-F]{4})/g, (match, grp) => {
            try {
              return String.fromCharCode(parseInt(grp, 16));
            } catch(e) {
              return match;
            }
          });

          const nameMatches = [...decodedContent.matchAll(/"(?:상품명|임시코드)"\s*:\s*"([a-zA-Z0-9\-\s\uAC00-\uD7A3_]+)"/gi)];
          const foundInLog: any[] = [];

          for (let mIdx = 0; mIdx < nameMatches.length; mIdx++) {
            const m = nameMatches[mIdx];
            const name = m[1];
            const startPos = m.index || 0;
            const endPos = (mIdx < nameMatches.length - 1) ? (nameMatches[mIdx + 1].index || decodedContent.length) : decodedContent.length;
            
            const subStr = decodedContent.substring(startPos, endPos);
            
            const danMatch = subStr.match(/"단가"\s*:\s*(\d+)/);
            const doMatch = subStr.match(/"도매가"\s*:\s*(\d+)/);
            const sMatch = subStr.match(/"S등급가"\s*:\s*(\d+)/) || subStr.match(/"S등급"\s*:\s*(\d+)/);
            const aMatch = subStr.match(/"A등급"\s*:\s*(\d+)/) || subStr.match(/"A등급가"\s*:\s*(\d+)/);
            const bMatch = subStr.match(/"B등급"\s*:\s*(\d+)/) || subStr.match(/"B등급가"\s*:\s*(\d+)/);
            const cMatch = subStr.match(/"C등급"\s*:\s*(\d+)/) || subStr.match(/"C등급가"\s*:\s*(\d+)/);
            const rateMatch = subStr.match(/"환율"\s*:\s*(\d+)/);
            const logisMatch = subStr.match(/"물류비"\s*:\s*(\d+)/);

            const dan = danMatch ? Number(danMatch[1]) : 0;
            if (dan > 0) {
              foundInLog.push({
                상품명: name,
                단가: dan,
                환율: rateMatch ? Number(rateMatch[1]) : 0,
                물류비: logisMatch ? Number(logisMatch[1]) : 0,
                도매가: doMatch ? Number(doMatch[1]) : 0,
                S등급가: sMatch ? Number(sMatch[1]) : 0,
                A등급: aMatch ? Number(aMatch[1]) : 0,
                B등급: bMatch ? Number(bMatch[1]) : 0,
                C등급: cMatch ? Number(cMatch[1]) : 0
              });
            }
          }

          if (foundInLog.length > 0) {
            matchedProducts.push({
              source: `tasks/${logFile}`,
              products: foundInLog
            });
          }
        }
      }
      scanSummary.push(`Scanned log files, found ${logMatchCount} files containing target codes`);
    }

    return NextResponse.json({
      success: true,
      scanSummary,
      matchedProductsCount: matchedProducts.length,
      matchedProducts
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: error.message
    });
  }
}
