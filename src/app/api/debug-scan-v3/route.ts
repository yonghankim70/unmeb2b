import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pddbPath = 'Z:\\HDD1\\PDDB';
    const weekPath = path.join(pddbPath, '23W');
    
    if (!fs.existsSync(weekPath)) {
      return NextResponse.json({
        success: false,
        message: '23W directory does not exist'
      });
    }

    const productDirs = fs.readdirSync(weekPath).filter(item => {
      const fullPath = path.join(weekPath, item);
      return fs.statSync(fullPath).isDirectory();
    });

    const fileDetails: any[] = [];

    for (const pDir of productDirs) {
      const pPath = path.join(weekPath, pDir);
      const files = fs.readdirSync(pPath);
      
      const txtFiles = files.filter(f => f.endsWith('.txt'));
      const details: any = {
        product: pDir,
        files: files,
        txtContents: []
      };

      for (const tf of txtFiles) {
        const tfPath = path.join(pPath, tf);
        const content = fs.readFileSync(tfPath, 'utf-8').trim();
        details.txtContents.push({
          fileName: tf,
          content: content
        });
      }
      fileDetails.push(details);
    }

    return NextResponse.json({
      success: true,
      fileDetails
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: error.message
    });
  }
}
