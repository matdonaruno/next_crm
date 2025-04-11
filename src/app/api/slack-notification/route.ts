import { NextResponse, NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    const { message, title, type } = requestBody;
    
    // 環境変数からSlack Webhook URLを取得
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.error('Slack Webhook URLが設定されていません');
      return NextResponse.json({ error: 'Slack Webhook URLが設定されていません' }, { status: 500 });
    }
    
    // Slackメッセージのフォーマット
    const slackPayload = {
      text: `*${title || '温度異常アラート'}*`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: title || "温度異常アラート",
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: message
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `*タイプ:* ${type || 'warning'} | *時刻:* ${new Date().toLocaleString('ja-JP')}`
            }
          ]
        }
      ]
    };
    
    console.log('Slackに送信するペイロード:', JSON.stringify(slackPayload));
    
    // Slack Webhookに通知を送信
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(slackPayload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Slack通知送信エラー:', errorText);
      return NextResponse.json({ error: 'Slack通知の送信に失敗しました' }, { status: 500 });
    }
    
    console.log('Slack通知を送信しました');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Slack通知処理エラー:', error);
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
} 