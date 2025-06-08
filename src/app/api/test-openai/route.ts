// テスト用OpenAI APIエンドポイント
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function GET(req: NextRequest) {
  console.log('[test-openai] テスト開始');
  
  // 環境変数確認
  const apiKey = process.env.OPENAI_API_KEY;
  console.log('[test-openai] API Key確認', {
    exists: !!apiKey,
    length: apiKey?.length || 0,
    prefix: apiKey?.substring(0, 20) || 'none'
  });
  
  if (!apiKey) {
    return NextResponse.json({ 
      error: 'API Key missing',
      details: 'OPENAI_API_KEY environment variable not set'
    }, { status: 500 });
  }

  try {
    // OpenAI クライアント初期化
    const openai = new OpenAI({ 
      apiKey: apiKey,
      timeout: 30000,
      maxRetries: 1,
    });
    
    console.log('[test-openai] OpenAI client created');
    
    // シンプルなAPI呼び出しテスト（モデルリスト取得）
    console.log('[test-openai] Testing API call...');
    const response = await openai.models.list();
    
    console.log('[test-openai] API call successful', {
      modelCount: response.data?.length || 0
    });
    
    return NextResponse.json({
      success: true,
      message: 'OpenAI API接続成功',
      modelCount: response.data?.length || 0,
      hasWhisper: response.data?.some(model => model.id.includes('whisper')) || false
    });
    
  } catch (error: any) {
    console.error('[test-openai] Error details:', {
      errorType: error.constructor.name,
      message: error.message,
      status: error.status,
      code: error.code,
      stack: error.stack?.split('\n').slice(0, 5)
    });
    
    return NextResponse.json({
      error: 'OpenAI API Error',
      details: error.message,
      type: error.constructor.name,
      status: error.status || 'unknown'
    }, { status: 500 });
  }
}