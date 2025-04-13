import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import OpenAI from 'openai';

// OpenAI クライアントの初期化
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ベクトル埋め込みを生成する関数
async function createEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('Embedding生成エラー:', error);
    throw new Error('テキストの埋め込み生成に失敗しました');
  }
}

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('API: 認証ヘッダーがありません');
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // リクエストボディを取得
    const body = await request.json();
    const { query, facilityId } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: '検索クエリが必要です' }, { status: 400 });
    }

    // クエリのベクトル埋め込みを生成
    console.log('クエリからベクトル埋め込みを生成:', query);
    const embedding = await createEmbedding(query);

    // Supabaseクライアントの初期化
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
    
    // 認証情報の確認
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('API: セッション取得エラー:', sessionError);
      return NextResponse.json({ error: '認証セッションが無効です' }, { status: 401 });
    }

    // 会議議事録データを取得
    // 注意: 実際のSemantic Searchを行うためには、以下のいずれかが必要:
    // 1. Supabaseのpgvectorエクステンションを有効にし、テーブルにベクトル列を追加
    // 2. または、代替としてすべての議事録を取得し、JavaScriptでコサイン類似度を計算
    
    console.log('会議議事録データを取得');
    const { data: meetingMinutes, error: dataError } = await supabase
      .from('meeting_minutes')
      .select(`
        id,
        title,
        meeting_date,
        content,
        summary,
        keywords,
        is_transcribed,
        meeting_types(name)
      `)
      .eq('facility_id', facilityId)
      .order('meeting_date', { ascending: false });

    if (dataError) {
      console.error('API: データ取得エラー:', dataError);
      return NextResponse.json({ error: 'データ取得中にエラーが発生しました' }, { status: 500 });
    }

    // 議事録がない場合
    if (!meetingMinutes || meetingMinutes.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // 各議事録の関連スコアを計算（実際のベクトル検索をシミュレート）
    console.log(`${meetingMinutes.length}件の議事録から関連性を計算`);
    
    // 各議事録について、コンテンツのベクトル埋め込みを作成して類似度を計算
    // 注: 実際の実装では大量のAPIコールを避けるため、ベクトルは事前に保存すべき
    const resultPromises = meetingMinutes.map(async (minute) => {
      // 検索対象テキストを作成（タイトル、内容、要約を結合）
      const searchText = `タイトル: ${minute.title}
内容: ${minute.content || ''}
要約: ${minute.summary || ''}
キーワード: ${minute.keywords ? minute.keywords.join(', ') : ''}`;

      try {
        // テキストの埋め込みを作成
        const contentEmbedding = await createEmbedding(searchText);
        
        // コサイン類似度を計算
        const similarity = calculateCosineSimilarity(embedding, contentEmbedding);
        
        // スニペットを作成（最大150文字）
        const snippet = createSnippet(searchText, query, 150);
        
        return {
          id: minute.id,
          title: minute.title,
          meeting_date: minute.meeting_date,
          meeting_type: minute.meeting_types?.[0]?.name || '',
          relevance: similarity,
          snippet
        };
      } catch (error) {
        console.error(`ID: ${minute.id}の議事録の埋め込み作成エラー:`, error);
        return null;
      }
    });

    // 並行処理の結果を待機
    const results = (await Promise.all(resultPromises))
      .filter(Boolean) // nullを除外
      .sort((a, b) => b!.relevance - a!.relevance) // 類似度でソート
      .slice(0, 5); // 上位5件のみ返す

    return NextResponse.json({ results });
  } catch (error) {
    console.error('API: 予期しないエラー:', error);
    return NextResponse.json({ error: '内部サーバーエラー' }, { status: 500 });
  }
}

// コサイン類似度を計算する関数
function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
}

// 検索クエリに基づいてスニペットを作成する関数
function createSnippet(text: string, query: string, maxLength: number = 150): string {
  // 単純化のため、クエリを含む部分を探して周囲のテキストを返す
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  
  const index = lowerText.indexOf(lowerQuery);
  if (index === -1) {
    // クエリが直接含まれていない場合、先頭から切り取る
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  }
  
  // クエリを中心にしたスニペットを作成
  const halfLength = Math.floor(maxLength / 2);
  let start = Math.max(0, index - halfLength);
  let end = Math.min(text.length, index + lowerQuery.length + halfLength);
  
  // 最大長さを超えないように調整
  if (end - start > maxLength) {
    end = start + maxLength;
  }
  
  // 単語の途中で切れないように調整
  while (start > 0 && text[start] !== ' ' && text[start] !== '\n') {
    start--;
  }
  
  while (end < text.length && text[end] !== ' ' && text[end] !== '\n') {
    end++;
  }
  
  let snippet = text.substring(start, end).trim();
  
  // 前後に省略記号を追加
  if (start > 0) {
    snippet = `...${snippet}`;
  }
  
  if (end < text.length) {
    snippet = `${snippet}...`;
  }
  
  return snippet;
} 