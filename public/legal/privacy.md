import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [policyChecked, setPolicyChecked] = useState(false);
  const [error, setError] = useState('');

  const getFullName = () => fullName.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyChecked) {
      setError('利用規約およびプライバシーポリシーに同意してください。');
      return;
    }
    try {
      const res = await fetch('/api/invitations/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password,
          fullName: getFullName(),
          policyAgreed: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || '登録に失敗しました。');
        return;
      }
      router.push('/dashboard');
    } catch (err) {
      setError('通信エラーが発生しました。');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="招待トークン"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="パスワード"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="氏名"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        required
      />
      <label>
        <input
          type="checkbox"
          checked={policyChecked}
          onChange={(e) => setPolicyChecked(e.target.checked)}
        />
        利用規約および&nbsp;
        <a href="/legal/privacy.md" target="_blank" rel="noopener" className="underline">
          プライバシーポリシー
        </a>
        に同意します
      </label>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button type="submit">登録</button>
    </form>
  );
}
