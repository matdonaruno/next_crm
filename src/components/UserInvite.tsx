import { useState, useCallback, ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';

export default function UserInvite() {
  const [inputEmail, setInputEmail] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setInputEmail(event.target.value);
    // 入力が変更されたら、前回のステータスメッセージをクリア
    if (status.type) {
      setStatus({ type: null, message: '' });
    }
  }, [status]);

  const inviteUser = useCallback(async () => {
    if (!inputEmail || !inputEmail.includes('@')) {
      setStatus({
        type: 'error',
        message: '有効なメールアドレスを入力してください'
      });
      return;
    }

    setIsLoading(true);
    setStatus({ type: null, message: '' });
    
    try {
      const response = await fetch(`/api/invite/${encodeURIComponent(inputEmail)}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '招待メールの送信に失敗しました');
      }
      
      setStatus({
        type: 'success',
        message: `${inputEmail}に招待メールを送信しました`
      });
      setInputEmail(''); // 入力をクリア
    } catch (error) {
      console.error('招待エラー:', error);
      
      // エラーメッセージのユーザーフレンドリーな表示
      let errorMessage = '招待メールの送信に失敗しました';
      
      if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        
        if (msg.includes('権限がありません')) {
          errorMessage = 'ユーザー招待の権限がありません。管理者に連絡してください。';
        } else if (msg.includes('既に招待')) {
          errorMessage = 'このメールアドレスには既に招待が送信されています。';
        } else if (msg.includes('無効なメールアドレス')) {
          errorMessage = '無効なメールアドレス形式です。正しいメールアドレスを入力してください。';
        } else if (msg.includes('制限') && msg.includes('達しました')) {
          // レート制限に関するエラーメッセージ
          errorMessage = error.message;
          // ヘルプメッセージを追加
          if (msg.includes('時間あたり')) {
            errorMessage += ' しばらく時間をおいて再試行してください。';
          } else if (msg.includes('1日あたり')) {
            errorMessage += ' 明日以降に再試行してください。';
          } else if (msg.includes('月間')) {
            errorMessage += ' 月間の招待上限に達しています。システム管理者にお問い合わせください。';
          }
        } else {
          errorMessage = error.message;
        }
      }
      
      setStatus({
        type: 'error',
        message: errorMessage
      });
    } finally {
      setIsLoading(false);
    }
  }, [inputEmail]);

  return (
    <div className="space-y-4 w-full max-w-md">
      {status.type && (
        <Alert variant={status.type === 'error' ? 'destructive' : 'default'}>
          {status.message}
        </Alert>
      )}
      
      <div className="flex items-center space-x-2">
        <Input
          type="email"
          placeholder="招待するメールアドレスを入力"
          value={inputEmail}
          onChange={handleChange}
          className="flex-1"
        />
        <Button onClick={inviteUser} disabled={isLoading}>
          {isLoading ? '送信中...' : '招待する'}
        </Button>
      </div>
      
      <p className="text-xs text-gray-500 mt-2">
        招待されたユーザーは、登録完了後に自分のアカウントでログインできるようになります。
        招待メールの有効期限は7日間です。
        <br />
        <span className="font-medium">注意</span>: 1時間あたり10件、1日あたり30件、月間200件の招待制限があります。
      </p>
    </div>
  );
} 