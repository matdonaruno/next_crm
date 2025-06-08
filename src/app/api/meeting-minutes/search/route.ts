// src/app/api/meeting-minutes/search/route.ts
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { Database } from '@/types/supabase';

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
    // 認証チェック（クッキーベースの認証を使用するため、Authorizationヘッダーは任意）
    const authHeader = request.headers.get('Authorization');
    console.log('API: Authorization header:', authHeader ? 'present' : 'missing');

    // リクエストボディを取得
    const body = await request.json();
    const { query, facilityId } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: '検索クエリが必要です' }, { status: 400 });
    }

    if (!facilityId) {
      console.error('API: 施設IDがリクエストにありません');
      return NextResponse.json({ error: '施設IDが必要です' }, { status: 400 });
    }

    // OpenAI APIキーの確認
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'dummy';

    let embedding: number[] | null = null;
    if (hasOpenAIKey) {
      try {
        // クエリのベクトル埋め込みを生成
        embedding = await createEmbedding(query);
      } catch (error) {
        console.error('埋め込み生成に失敗しました:', error);
        // フォールバックとしてテキスト検索を使用
      }
    }

    // Supabaseクライアントの初期化
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll().map(c => ({
              name: c.name,
              value: c.value,
              options: {},
            }))
          },
          setAll() {},
        },
      },
    );
    
    // 認証情報の確認
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('API: 認証エラー:', authError);
      return NextResponse.json({ error: '認証セッションが無効です' }, { status: 401 });
    }
    
    // ユーザーの施設IDを確認
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('facility_id')
      .eq('id', user.id)
      .single();
      
    if (profileError || !profileData?.facility_id) {
      console.error('API: ユーザープロファイル取得エラー:', profileError);
      return NextResponse.json({ error: 'ユーザープロファイルが見つかりません' }, { status: 404 });
    }
    
    // リクエストの施設IDとユーザーの施設IDが一致することを確認
    if (profileData.facility_id !== facilityId) {
      console.error('API: 施設IDの不一致:', { 
        requestFacilityId: facilityId, 
        userFacilityId: profileData.facility_id 
      });
      return NextResponse.json({ error: '指定された施設IDにアクセスする権限がありません' }, { status: 403 });
    }

    // 会議議事録データを取得
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
    
    let results;
    
    if (embedding && meetingMinutes.length > 0) {
      // ベクトル検索を使用
      try {
        const resultPromises = meetingMinutes.map(async (minute) => {
          // 検索対象テキストを作成（タイトル、内容、要約を結合）
          const searchText = `${minute.title} ${minute.content || ''} ${minute.summary || ''}`.trim();
          
          if (!searchText) {
            return null;
          }

          try {
            // テキストの埋め込みを作成
            const contentEmbedding = await createEmbedding(searchText);
            
            // コサイン類似度を計算
            const similarity = calculateCosineSimilarity(embedding, contentEmbedding);
            
            // 類似度が低すぎる場合は除外
            if (similarity < 0.1) {
              return null;
            }
            
            // スニペットを作成（最大150文字）
            const snippet = createSnippet(searchText, query, 150);
            
            return {
              id: minute.id,
              title: minute.title,
              meeting_date: minute.meeting_date,
              meeting_type: minute.meeting_types?.name || '',
              relevance: similarity,
              snippet
            };
          } catch (error) {
            console.error(`ID: ${minute.id}の議事録の埋め込み作成エラー:`, error);
            return null;
          }
        });
        
        // 並行処理の結果を待機
        const vectorResults = (await Promise.all(resultPromises))
          .filter(Boolean) // nullを除外
          .sort((a, b) => b!.relevance - a!.relevance) // 類似度でソート
          .slice(0, 5); // 上位5件のみ返す
          
        if (vectorResults.length > 0) {
          results = vectorResults;
        }
      } catch (error) {
        console.error('ベクトル検索でエラーが発生:', error);
      }
    }
    
    // ベクトル検索で結果が得られなかった場合、テキスト検索にフォールバック
    if (!results || results.length === 0) {
      // シンプルなテキスト検索を使用
      const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);
      
      results = meetingMinutes
        .map((minute) => {
          const searchText = `${minute.title} ${minute.content || ''} ${minute.summary || ''} ${minute.keywords?.join(' ') || ''}`.toLowerCase();
          
          let relevance = 0;
          let matchCount = 0;
          
          for (const term of searchTerms) {
            if (searchText.includes(term)) {
              matchCount++;
              // タイトルにマッチした場合は高いスコア
              if (minute.title?.toLowerCase().includes(term)) {
                relevance += 0.5;
              }
              // 内容やサマリーにマッチした場合は通常のスコア
              if ((minute.content || '').toLowerCase().includes(term) || 
                  (minute.summary || '').toLowerCase().includes(term)) {
                relevance += 0.3;
              }
            }
          }
          
          // マッチした検索語の割合も考慮
          relevance = relevance * (matchCount / searchTerms.length);
          
          const snippet = createSnippet(
            `タイトル: ${minute.title}\n内容: ${minute.content || ''}\n要約: ${minute.summary || ''}`,
            query,
            150
          );
          
          return {
            id: minute.id,
            title: minute.title,
            meeting_date: minute.meeting_date,
            meeting_type: minute.meeting_types?.[0]?.name || '',
            relevance,
            snippet
          };
        })
        .filter(result => result.relevance > 0)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 5);
    }

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