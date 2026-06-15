import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getDbPath, readExcelData } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ 
        success: false, 
        message: 'GEMINI_API_KEY가 설정되지 않았습니다. .env.local 파일을 확인해 주세요.' 
      }, { status: 500 });
    }

    const { week, code } = await request.json();
    if (!week || !code) {
      return NextResponse.json({ 
        success: false, 
        message: '필수 파라미터(week, code)가 누락되었습니다.' 
      }, { status: 400 });
    }

    // 1. 대표 이미지 찾기
    const dbPath = getDbPath();
    const targetDir = path.resolve(dbPath, week, code);

    if (!fs.existsSync(targetDir)) {
      return NextResponse.json({ 
        success: false, 
        message: `상품 디렉토리가 존재하지 않습니다: ${week}/${code}` 
      }, { status: 404 });
    }

    const filesInDir = fs.readdirSync(targetDir);
    const imageFile = filesInDir.find(f => {
      const ext = path.extname(f).toLowerCase();
      return ext === '.jpg' || ext === '.jpeg' || ext === '.png';
    });

    if (!imageFile) {
      return NextResponse.json({ 
        success: false, 
        message: '상품 폴더 내에 이미지 파일(.jpg, .jpeg, .png)이 존재하지 않습니다.' 
      }, { status: 404 });
    }

    const targetFilePath = path.join(targetDir, imageFile);
    const fileBuffer = fs.readFileSync(targetFilePath);
    const base64Image = fileBuffer.toString('base64');

    let mimeType = 'image/jpeg';
    const ext = path.extname(imageFile).toLowerCase();
    if (ext === '.png') mimeType = 'image/png';

    // 2. 마스터 데이터(아이템, 컬러) 로딩
    const dbData = readExcelData();
    const itemsList = dbData.items || [];
    const colorsList = dbData.colors || [];

    if (itemsList.length === 0 || colorsList.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: '아이템마스터 또는 컬러마스터 데이터가 비어 있어 분석을 진행할 수 없습니다.' 
      }, { status: 500 });
    }

    // 3. Gemini 프롬프트 구성
    const itemsText = itemsList.map(i => `- ${i.아이템} (표기명: ${i.표기})`).join('\n');
    const colorsText = colorsList.map(c => `- ${c.컬러} (표기명: ${c.표기컬러})`).join('\n');

    const promptText = `
당신은 패션 카탈로그 분석 AI입니다.
제공된 의류 이미지를 시각적으로 분석하고, 아래의 허용된 리스트 중에서 가장 적합한 아이템 종류 1개와 어울리는 컬러(색상)들을 판단하여 분류해 주세요.

[허용된 아이템 리스트]
${itemsText}

[허용된 컬러 리스트]
${colorsText}

분석 및 분류 규칙:
1. 아이템(item): 위의 [허용된 아이템 리스트]에서 단 하나의 값만 선택하세요. 가급적 코드명(예: 'kt(니트)')을 그대로 기입하되, 만약 한국어 표기명(예: '니트')으로 반환해도 코드명으로 자동 변환되니 가장 유사한 종류를 정확히 선택하십시오.
2. 컬러(colors): 위의 [허용된 컬러 리스트]에서 옷의 주된 바탕 색상(메인 컬러) 위주로 분류하여 선택해 주십시오.
   - 중요: 스트라이프(줄무늬), 체크, 단가라 패턴 등 여러 배색이 섞여 있는 경우, 원단에 포함된 모든 미세한 선 색상들(예: 얇은 회색 줄무늬, 흰색 실 등)을 개별로 구구절절 나열하지 말고, **의류 전체 디자인을 대표하는 가장 핵심적인 메인 색상 2~3개만** 대표로 선택해 주십시오.
   - 예를 들어, 파란색/남색/브라운 계열 배색 니트 3벌이 놓여 있는 사진이라면 줄무늬의 검은색, 크림색 등은 무시하고 '네이비, 블루, 머스타드(또는 브라운/베이지)'와 같이 핵심 메인 색상만 대표로 선택해야 합니다.
   - 여러 개일 경우 쉼표와 공백으로 구분해 기입해 주십시오. (예: 'GR(그레이)' 또는 'GR(그레이), BK(블랙)')
3. 출력 형식: 반드시 다음 JSON 형식으로만 답변해 주십시오. 마크다운 백틱(\`\`\`json) 등 기타 설명 텍스트를 절대 덧붙이지 마십시오.

{
  "item": "선택한 아이템 명칭",
  "colors": "선택한 컬러 명칭(들)"
}
    `.trim();

    // 4. Gemini API 호출
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const requestBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Image
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[AI Auto API] Gemini API 에러 응답:', errorText);
      return NextResponse.json({ 
        success: false, 
        message: `Gemini API 호출에 실패했습니다: ${res.statusText} (${res.status})` 
      }, { status: res.status });
    }

    const resJson = await res.json();
    const modelOutputText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!modelOutputText) {
      return NextResponse.json({ 
        success: false, 
        message: 'Gemini API로부터 올바른 응답 텍스트를 받지 못했습니다.' 
      }, { status: 500 });
    }

    try {
      const parsedOutput = JSON.parse(modelOutputText.trim());
      
      // 5. 마스터 데이터 기반 매핑 로직
      let matchedItem = '';
      const parsedItem = parsedOutput.item ? String(parsedOutput.item).trim() : '';
      
      if (parsedItem) {
        // 아이템 매핑 시도
        const foundItem = itemsList.find(i => 
          i.아이템.toLowerCase() === parsedItem.toLowerCase() ||
          i.표기.toLowerCase() === parsedItem.toLowerCase() ||
          i.아이템.toLowerCase().includes(parsedItem.toLowerCase()) ||
          parsedItem.toLowerCase().includes(i.표기.toLowerCase())
        );
        if (foundItem) {
          matchedItem = foundItem.아이템;
        }
      }

      // 컬러 매핑 시도
      const matchedColorsArray: string[] = [];
      const parsedColors = parsedOutput.colors ? String(parsedOutput.colors).split(',') : [];

      for (const parsedColor of parsedColors) {
        const cleanColor = parsedColor.trim();
        if (!cleanColor) continue;

        const foundColor = colorsList.find(c => 
          c.컬러.toLowerCase() === cleanColor.toLowerCase() ||
          c.표기컬러.toLowerCase() === cleanColor.toLowerCase() ||
          c.컬러.toLowerCase().includes(cleanColor.toLowerCase()) ||
          cleanColor.toLowerCase().includes(c.표기컬러.toLowerCase())
        );

        if (foundColor && !matchedColorsArray.includes(foundColor.컬러)) {
          matchedColorsArray.push(foundColor.컬러);
        }
      }
      const matchedColors = matchedColorsArray.join(', ');

      return NextResponse.json({
        success: true,
        item: matchedItem,
        colors: matchedColors
      });
    } catch (parseError: any) {
      console.error('[AI Auto API] JSON 파싱/매핑 에러. 원본 응답:', modelOutputText);
      return NextResponse.json({ 
        success: false, 
        message: `AI 응답 처리 중 오류가 발생했습니다: ${parseError.message}`,
        rawOutput: modelOutputText 
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('[AI Auto API POST] 에러 발생:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || '서버 내부 오류가 발생했습니다.' 
    }, { status: 500 });
  }
}
