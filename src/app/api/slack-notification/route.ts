// src/app/api/slack-notification/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { formatJSTDateTime } from '@/lib/utils';

// Ensure Slack Webhook URL is set
const webhookUrl = process.env.SLACK_WEBHOOK_URL;
if (!webhookUrl) {
  throw new Error('SLACK_WEBHOOK_URL must be set');
}

export const dynamic = 'force-dynamic'; // Cookie を読むので動的に

/** POST /api/slack-notification
 *
 * body: { message: string; title?: string; type?: string }
 * サインイン済みユーザーだけが呼べる Slack 通知エンドポイント
 */
export async function POST(req: NextRequest) {
  /* 1) Supabase SSR クライアント & 認証チェック ---------------------- */
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2) JSON parsing with type validation
  type Payload = { message: string; title?: string; type?: string };
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof raw !== 'object' || raw === null) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
  const { message, title = '温度異常アラート', type = 'warning' } = raw as Payload;
  if (typeof message !== 'string' || message.trim() === '') {
    return NextResponse.json({ error: '`message` is required' }, { status: 400 });
  }
  if (message.length > 2000) {
    return NextResponse.json(
      { error: 'message is too long (max 2000 chars)' },
      { status: 400 },
    );
  }

  /* 3) Webhook URL -------------------------------------------------- */
  if (!webhookUrl) {
    console.error('[slack] SLACK_WEBHOOK_URL is not set');
    return NextResponse.json(
      { error: 'Slack Webhook URL 未設定' },
      { status: 500 },
    );
  }

  /* 4) Slack 送信ペイロード ----------------------------------------- */
  const slackPayload = {
    text: `*${title}*`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: title,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `*タイプ:* ${type} | *時刻:* ${formatJSTDateTime(new Date())}`,
          },
          {
            type: 'mrkdwn',
            text: `*by:* <mailto:${user.email}|${user.email}>`,
          },
        ],
      },
    ],
  };

  // 5) Slack Webhook へ POST (network errors are caught)
  let slackRes: Response;
  try {
    slackRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload),
    });
  } catch (e) {
    console.error('[slack] network error:', e);
    return NextResponse.json(
      { error: 'Slack 通知送信中にエラーが発生しました' },
      { status: 500 },
    );
  }
  if (!slackRes.ok) {
    const txt = await slackRes.text();
    console.error('[slack] send error:', txt);
    return NextResponse.json(
      { error: 'Slack 通知送信に失敗しました' },
      { status: 500 },
    );
  }

  /* 6) 成功応答 ----------------------------------------------------- */
  return NextResponse.json({ success: true });
}
