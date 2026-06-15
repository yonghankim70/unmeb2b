const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\yongh\\.gemini\\antigravity\\brain\\d3603749-8bde-4921-877c-974e4ca79e10\\.system_generated\\logs\\transcript.jsonl';
if (!fs.existsSync(logPath)) {
  console.error('Log file not found');
  process.exit(1);
}

const lines = fs.readFileSync(logPath, 'utf-8').split('\n');
console.log(`Loaded ${lines.length} lines.`);

let foundCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('BC0603') && line.includes('단가')) {
    // line.content 또는 tool_calls의 인자에서 [ ... ] 형태의 JSON 문자열 추출
    const startIdx = line.indexOf('[');
    const endIdx = line.lastIndexOf(']');
    
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      let rawContent = line.substring(startIdx, endIdx + 1);
      
      // JSON Escape 해제
      if (rawContent.includes('\\"')) {
        try {
          rawContent = JSON.parse('"' + rawContent + '"');
        } catch(e) {}
      }
      
      // 줄번호 정제 로직 (여러 형태의 줄번호 제거)
      const candLines = rawContent.split('\n');
      const cleanLines = [];
      
      for (let cl of candLines) {
        cl = cl.trim();
        if (cl.includes('Created At') || cl.includes('Completed At') || cl.includes('File Path') || cl.includes('Total Lines') || cl.includes('Showing lines') || cl.includes('The following code')) {
          continue;
        }
        
        // 앞부분의 숫자:숫자: 혹은 숫자: 패턴을 완전히 제거
        // 예: "9: 2:   {" -> "{"
        // 예: "125:     \"단가\": 0," -> "\"단가\": 0,"
        let prev = '';
        while (cl !== prev) {
          prev = cl;
          cl = cl.replace(/^\d+:\s*/, '').trim();
        }
        
        cleanLines.push(cl);
      }
      
      const cleanJsonStr = cleanLines.join('\n').trim();
      
      // 파싱 시도
      try {
        const parsed = JSON.parse(cleanJsonStr);
        if (Array.isArray(parsed)) {
          // 단가가 0보다 큰 상품 개수 체크
          const nonZero = parsed.filter(p => (Number(p.단가) || 0) > 0);
          console.log(`[Line ${i + 1}] Size: ${parsed.length}, Non-zero count: ${nonZero.length}`);
          if (nonZero.length > 0) {
            foundCount++;
            fs.writeFileSync(`c:\\Users\\yongh\\Desktop\\B2B_WebApp\\recovered_db_${foundCount}.json`, JSON.stringify(parsed, null, 2), 'utf-8');
            console.log(`  -> SUCCESS! Saved recovered_db_${foundCount}.json`);
          }
        }
      } catch(err) {
        // 대괄호 닫기 에러 처리 (끝 괄호가 덜 잘려나갔을 수 있으므로 뒤에서부터 잘라가며 시도)
        let tempStr = cleanJsonStr;
        let success = false;
        while (tempStr.lastIndexOf('}') !== -1 && !success) {
          const lastBracket = tempStr.lastIndexOf(']');
          if (lastBracket === -1) break;
          tempStr = tempStr.substring(0, lastBracket + 1);
          try {
            const parsed2 = JSON.parse(tempStr);
            if (Array.isArray(parsed2)) {
              const nonZero = parsed2.filter(p => (Number(p.단가) || 0) > 0);
              console.log(`[Line ${i + 1} - BracketFix] Size: ${parsed2.length}, Non-zero: ${nonZero.length}`);
              if (nonZero.length > 0) {
                foundCount++;
                fs.writeFileSync(`c:\\Users\\yongh\\Desktop\\B2B_WebApp\\recovered_db_${foundCount}.json`, JSON.stringify(parsed2, null, 2), 'utf-8');
                console.log(`  -> SUCCESS (bracket fixed)! Saved recovered_db_${foundCount}.json`);
                success = true;
              }
            }
          } catch(e) {
            tempStr = tempStr.substring(0, tempStr.length - 1); // 괄호 하나 제거하고 다시 시도
          }
        }
      }
    }
  }
}

console.log(`Finished scanning. Found ${foundCount} valid recovered JSONs.`);
