import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // クライアントのIPアドレスを取得
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  
  // リクエストの詳細を取得
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  console.log(`ESP8266接続テスト: ${clientIp} - UA: ${userAgent}`);
  
  // JSONレスポンスを返す
  return NextResponse.json({
    status: 'success',
    message: 'HTTPS接続テスト成功！',
    timestamp: new Date().toISOString(),
    client: {
      ip: clientIp,
      userAgent: userAgent
    }
  });
} 