// src/app/admin/user-management/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { User } from '@supabase/supabase-js';

import supabase from '@/lib/supabaseBrowser';
import { Database } from '@/types/supabase';

import { AppHeader } from '@/components/ui/app-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LoadingUI from '@/components/LoadingUI';
import { useToast } from '@/hooks/use-toast';

/* ------------------------------------------------------------------ */
/* 1. 定数                                                             */
/* ------------------------------------------------------------------ */
type Role = Database['public']['Enums']['user_role'];

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'superuser', label: 'スーパーユーザー' },
  { value: 'facility_admin', label: '施設管理者' },
  { value: 'approver', label: '承認者' },
  { value: 'regular_user', label: '一般ユーザー' },
];

/* ------------------------------------------------------------------ */
/* 2. コンポーネント                                                  */
/* ------------------------------------------------------------------ */
/* 型 */
interface Invitation {
  id: string;
  email: string;
  role: Role;
  facility_id: string;
  expires_at: string;
  is_used: boolean;
  facilities: { name: string } | null;
}

interface UserProfileRow {
  id: string;
  fullname: string | null;
  email: string | null;
  role: Role;
  is_active: boolean;
  facility_id: string | null;
  facilities: { name: string } | null;
}

export default function UserManagement() {
  const router = useRouter();
  const { toast } = useToast();

  /* -------------------- state -------------------- */
  const [loading, setLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<Role | null>(null);
  const [currentUserFacilityId, setCurrentUserFacilityId] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'invite' | 'invitations' | 'users'>(
    'invite',
  );

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [users, setUsers] = useState<UserProfileRow[]>([]);
  const [showInactiveUsers, setShowInactiveUsers] = useState(false);

  /* 招待フォーム */
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('regular_user');

  /* ---------------------------------------------------------------- */
  /* 3. 認証＆ロールチェック                                           */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setCurrentUser(user);

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, facility_id')
        .eq('id', user.id)
        .single();

      if (error || !profile) {
        toast({
          title: '認証エラー',
          description: 'プロフィールを取得できませんでした',
          variant: 'destructive',
        });
        router.push('/depart');
        return;
      }

      setCurrentUserRole(profile.role);
      setCurrentUserFacilityId(profile.facility_id ?? '');

      if (['superuser', 'facility_admin'].includes(profile.role)) {
        setIsAuthorized(true);
      } else {
        toast({
          title: 'アクセス権限エラー',
          description: 'このページにアクセスする権限がありません',
          variant: 'destructive',
        });
        router.push('/depart');
      }

      setIsCheckingAuth(false);
    })();
  }, [router, toast]);

  /* ---------------------------------------------------------------- */
  /* 4. 招待リスト & ユーザーリスト取得                                */
  /* ---------------------------------------------------------------- */
  const loadLists = async () => {
    setLoading(true);

    /* 招待 */
    const { data: inv, error: invErr } = await supabase
      .from('user_invitations')
      .select(`
        *,
        facilities(name)
      `)
      .order('created_at', { ascending: false });

    if (invErr) {
      toast({
        title: '招待リスト取得エラー',
        description: invErr.message,
        variant: 'destructive',
      });
    } else {
      setInvitations(inv as Invitation[]);
    }

    /* ユーザー */
    const { data: usr, error: usrErr } = await supabase
      .from('profiles')
      .select(`
        id,
        fullname,
        email,
        role,
        is_active,
        facility_id,
        facilities(name)
      `)
      .order('created_at', { ascending: false });

    if (usrErr) {
      toast({
        title: 'ユーザーリスト取得エラー',
        description: usrErr.message,
        variant: 'destructive',
      });
    } else {
      setUsers(usr as UserProfileRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!isAuthorized) return;
    loadLists();
  }, [isAuthorized, toast]);

  /* ---------------------------------------------------------------- */
  /* 5. 招待送信                                                      */
  /* ---------------------------------------------------------------- */
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !role || !currentUserFacilityId) {
      toast({
        title: '入力エラー',
        description: 'メール・ロールが未入力、または施設情報がありません',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          role,
          facilityId: currentUserFacilityId,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '招待送信に失敗しました');

      toast({
        title: '招待メール送信完了',
        description: `${email} に招待メールを送信しました`,
      });

      setEmail('');
      setRole('regular_user');
      // 招待リストを即時再読込
      await loadLists();
    } catch (err: any) {
      toast({
        title: '招待エラー',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* 6. 招待キャンセル                                                */
  /* ---------------------------------------------------------------- */
  const handleCancelInvitation = async (invId: string) => {
    if (!confirm('この招待を取り消しますか？')) return;

    setLoading(true);
    const { error } = await supabase
      .from('user_invitations')
      .delete()
      .eq('id', invId);

    if (error) {
      toast({
        title: 'キャンセル失敗',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setInvitations((prev) => prev.filter((i) => i.id !== invId));
      toast({ title: '招待を取り消しました' });
    }
    setLoading(false);
  };

  /* ---------------------------------------------------------------- */
  /* 7. ユーザー操作（停止 / 有効化 / ロール変更）                    */
  /* ---------------------------------------------------------------- */
  const toggleUserActive = async (userId: string, isActive: boolean) => {
    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !isActive })
      .eq('id', userId);

    if (error) {
      toast({
        title: '更新エラー',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, is_active: !isActive } : u,
        ),
      );
    }
    setLoading(false);
  };

  const changeUserRole = async (userId: string, newRole: Role) => {
    setLoading(true);
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) {
      toast({
        title: 'ロール変更エラー',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)),
      );
    }
    setLoading(false);
  };

  /* ---------------------------------------------------------------- */
  /* 8. 描画                                                          */
  /* ---------------------------------------------------------------- */
  if (isCheckingAuth)
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingUI />
      </div>
    );

  if (!isAuthorized)
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="max-w-md border-pink-200 shadow-md">
          <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-t-lg">
            <CardTitle className="text-pink-800">アクセス権限がありません</CardTitle>
            <CardDescription>
              このページにアクセスするには管理者権限が必要です
            </CardDescription>
          </CardHeader>
          <CardFooter className="bg-pink-50">
            <Button onClick={() => router.push('/depart')}>ホームに戻る</Button>
          </CardFooter>
        </Card>
      </div>
    );

  /* ---------- 実際の UI ---------- */
  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50">
      <AppHeader
        showBackButton
        title="ユーザー管理"
        icon={<Users className="h-6 w-6 text-pink-400" />}
      />

      <div className="container max-w-5xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab as any}>
          {/* ---------------- Tab ボタン ---------------- */}
          <TabsList className="grid w-full grid-cols-3 bg-pink-100 p-1 mb-6">
            <TabsTrigger value="invite">ユーザー招待</TabsTrigger>
            <TabsTrigger value="invitations">招待リスト</TabsTrigger>
            <TabsTrigger value="users">ユーザーリスト</TabsTrigger>
          </TabsList>

          {/* ---------------- 1) 招待フォーム ----------- */}
          <TabsContent value="invite">
            <Card className="border-pink-200 shadow-md">
              <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-t-lg">
                <CardTitle className="flex items-center gap-2 text-pink-800">
                  <Users className="h-5 w-5" />
                  新規ユーザー招待
                </CardTitle>
                <CardDescription>招待メールを送信します</CardDescription>
              </CardHeader>

              <form onSubmit={handleInvite}>
                <CardContent className="space-y-4 pt-6">
                  <div className="space-y-2">
                    <Label htmlFor="email">メールアドレス</Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role">ロール</Label>
                    <select
                      id="role"
                      value={role}
                      onChange={(e) =>
                        setRole(
                          e.target.value as Database['public']['Enums']['user_role'],
                        )
                      }
                      className="w-full border rounded p-2"
                    >
                      {ROLE_OPTIONS.filter(
                        (o) =>
                          currentUserRole === 'superuser' ||
                          o.value !== 'superuser',
                      ).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </CardContent>

                <CardFooter className="bg-pink-50">
                  <Button type="submit" disabled={loading}>
                    {loading ? '送信中…' : '招待を送信'}
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>

          {/* ---------------- 2) 招待リスト -------------- */}
          <TabsContent value="invitations">
            <Card className="border-pink-200 shadow-md">
              <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-t-lg">
                <CardTitle className="flex items-center gap-2 text-pink-800">
                  <Users className="h-5 w-5" />
                  招待リスト
                </CardTitle>
              </CardHeader>

              <CardContent className="pt-6">
                {loading ? (
                  <LoadingUI />
                ) : invitations.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">招待はありません</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-pink-50 border-b border-pink-200">
                          <th className="p-2">メール</th>
                          <th className="p-2">ロール</th>
                          <th className="p-2">施設</th>
                          <th className="p-2">有効期限</th>
                          <th className="p-2">状態</th>
                          <th className="p-2">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invitations.map((inv) => {
                          const expired =
                            new Date(inv.expires_at) < new Date();
                          return (
                            <tr
                              key={inv.id}
                              className="border-b border-pink-100 hover:bg-pink-50"
                            >
                              <td className="p-2">{inv.email}</td>
                              <td className="p-2">
                                {
                                  ROLE_OPTIONS.find((r) => r.value === inv.role)!
                                    .label
                                }
                              </td>
                              <td className="p-2">{inv.facilities?.name}</td>
                              <td className="p-2">
                                {new Date(inv.expires_at).toLocaleString('ja-JP')}
                              </td>
                              <td className="p-2">
                                {inv.is_used ? (
                                  <span className="text-green-600">使用済み</span>
                                ) : expired ? (
                                  <span className="text-red-600">期限切れ</span>
                                ) : (
                                  <span className="text-blue-600">有効</span>
                                )}
                              </td>
                              <td className="p-2">
                                {!inv.is_used && !expired && (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleCancelInvitation(inv.id)}
                                  >
                                    取消
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- 3) ユーザーリスト ---------- */}
          <TabsContent value="users">
            <Card className="border-pink-200 shadow-md">
              <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-t-lg">
                <CardTitle className="flex items-center gap-2 text-pink-800">
                  <Users className="h-5 w-5" />
                  ユーザーリスト
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => setShowInactiveUsers((v) => !v)}
                >
                  {showInactiveUsers ? '停止中を隠す' : '停止中を表示'}
                </Button>
              </CardHeader>

              <CardContent className="pt-6">
                {loading ? (
                  <LoadingUI />
                ) : users.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    ユーザーがいません
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-pink-50 border-b border-pink-200">
                          <th className="p-2">名前</th>
                          <th className="p-2">メール</th>
                          <th className="p-2">ロール</th>
                          <th className="p-2">施設</th>
                          <th className="p-2">状態</th>
                          <th className="p-2">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users
                          .filter((u) => showInactiveUsers || u.is_active)
                          .map((u) => (
                            <tr
                              key={u.id}
                              className="border-b border-pink-100 hover:bg-pink-50"
                            >
                              <td className="p-2">{u.fullname || '-'}</td>
                              <td className="p-2">{u.email}</td>
                              <td className="p-2">
                                <select
                                  value={u.role ?? 'regular_user'}
                                  onChange={(e) =>
                                    changeUserRole(
                                      u.id,
                                      e.target.value as Role,
                                    )
                                  }
                                  disabled={
                                    loading ||
                                    currentUserRole !== 'superuser'
                                  }
                                  className="p-1 border rounded w-full text-sm"
                                >
                                  {ROLE_OPTIONS.filter(
                                    (o) =>
                                      currentUserRole === 'superuser' ||
                                      o.value !== 'superuser',
                                  ).map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="p-2">{u.facilities?.name || '-'}</td>
                              <td className="p-2">
                                {u.is_active ? (
                                  <span className="text-green-600">有効</span>
                                ) : (
                                  <span className="text-red-600">停止</span>
                                )}
                              </td>
                              <td className="p-2">
                                <Button
                                  size="sm"
                                  variant={u.is_active ? 'destructive' : 'default'}
                                  disabled={loading || currentUser?.id === u.id}
                                  onClick={() =>
                                    toggleUserActive(u.id, u.is_active)
                                  }
                                >
                                  {u.is_active ? '停止' : '有効化'}
                                </Button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
