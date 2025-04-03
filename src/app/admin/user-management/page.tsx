'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { AppHeader } from '@/components/ui/app-header';
import { Users } from 'lucide-react';
import { LoadingUI } from '@/components/LoadingUI';
import { useEffect as useEffectOnce } from 'react';

// ロールの選択肢
const ROLE_OPTIONS = [
  { value: 'superuser', label: 'スーパーユーザー' },
  { value: 'facility_admin', label: '施設管理者' },
  { value: 'approver', label: '承認者' },
  { value: 'regular_user', label: '一般ユーザー' }
];

export default function UserManagement() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('invite');
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  
  // 招待フォーム用のステート
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('regular_user');
  const [currentUserFacilityId, setCurrentUserFacilityId] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  // ユーザーのロールを確認し、アクセス権限をチェック
  useEffect(() => {
    async function checkUserRole() {
      setIsCheckingAuth(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, facility_id')
          .eq('id', user.id)
          .single();
        
        if (profile) {
          setCurrentUserRole(profile.role);
          setCurrentUserFacilityId(profile.facility_id);
          
          // スーパーユーザーまたは施設管理者のみアクセス可能
          if (profile.role === 'superuser' || profile.role === 'facility_admin') {
            setIsAuthorized(true);
          } else {
            setIsAuthorized(false);
            toast({
              title: 'アクセス権限エラー',
              description: 'このページにアクセスする権限がありません',
              variant: 'destructive'
            });
            router.push('/depart'); // 権限がない場合はホームにリダイレクト
          }
        }
      } else {
        router.push('/login'); // ログインしていない場合はログインページにリダイレクト
      }
      
      setIsCheckingAuth(false);
    }
    
    checkUserRole();
  }, [router, toast]);
  
  // 現在のユーザーの施設情報を取得
  useEffect(() => {
    async function fetchCurrentUserFacility() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('facility_id')
          .eq('id', user.id)
          .single();
        
        if (profile && profile.facility_id) {
          setCurrentUserFacilityId(profile.facility_id);
        }
      }
    }
    
    fetchCurrentUserFacility();
  }, []);
  
  // 部門の取得
  useEffect(() => {
    async function fetchDepartments() {
      // 現在のユーザーの施設に属する部門のみを取得
      if (currentUserFacilityId) {
        const { data: departmentsData } = await supabase
          .from('departments')
          .select('*')
          .eq('facility_id', currentUserFacilityId);
        
        setDepartments(departmentsData || []);
      }
    }
    
    fetchDepartments();
  }, [currentUserFacilityId]);
  
  // 招待リストと既存ユーザーの取得
  useEffect(() => {
    async function fetchInvitationsAndUsers() {
      setLoading(true);
      
      try {
        // 招待リストの取得（クエリを簡素化）
        const { data: invitationsData, error: invitationsError } = await supabase
          .from('user_invitations')
          .select(`
            *,
            facilities(name)
          `)
          .order('created_at', { ascending: false });
        
        if (invitationsError) {
          console.error('招待リスト取得エラー:', invitationsError);
        } else {
          setInvitations(invitationsData || []);
        }
        
        // 既存ユーザーリストの取得
        const { data: usersData, error: usersError } = await supabase
          .from('profiles')
          .select(`
            *,
            facilities(name)
          `)
          .order('created_at', { ascending: false });
        
        if (usersError) {
          console.error('ユーザーリスト取得エラー:', usersError);
        } else {
          setUsers(usersData || []);
        }
      } catch (error) {
        console.error('データ取得エラー:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchInvitationsAndUsers();
  }, [activeTab]);
  
  // 新規ユーザー招待
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !role || !currentUserFacilityId) {
      toast({
        title: '入力エラー',
        description: 'メールアドレスとロールは必須です。また、あなたの施設情報が取得できませんでした。',
        variant: 'destructive'
      });
      return;
    }
    
    try {
      setLoading(true);
      console.log('招待リクエストを送信: ', { email, role, facilityId: currentUserFacilityId });
      
      // APIを呼び出して招待処理
      const response = await fetch('/api/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          role,
          facilityId: currentUserFacilityId,
          departmentId: null // 部門IDはnullに設定
        }),
      });
      
      const result = await response.json();
      console.log('招待APIレスポンス:', { status: response.status, statusText: response.statusText, data: result });
      
      if (!response.ok) {
        // 既存の招待が見つかった場合は特別なエラーメッセージを表示
        if (result.canDelete && result.invitation) {
          const invitation = result.invitation;
          const errorMessage = result.error + " 削除しますか？";
          
          // 招待削除の確認を表示
          if (confirm(errorMessage)) {
            await handleCancelInvitation(invitation.id, true);
            // 削除後に再度招待処理を試みる
            if (confirm("招待を削除しました。もう一度招待を送信しますか？")) {
              // 再帰的に招待処理を呼び出し
              handleInvite(e);
              return;
            }
          }
        }
        
        throw new Error(result.error || result.details || '招待処理中にエラーが発生しました');
      }
      
      // 成功メッセージ
      toast({
        title: '招待メール送信完了',
        description: `${email}に招待メールを送信しました。`,
      });
      
      // フォームをリセット
      setEmail('');
      setRole('regular_user');
      
      // 招待リストを更新
      const { data: invitationsData } = await supabase
        .from('user_invitations')
        .select(`
          *,
          facilities(name)
        `)
        .order('created_at', { ascending: false });
      
      setInvitations(invitationsData || []);
      
    } catch (error: any) {
      console.error('招待エラーの詳細:', error);
      toast({
        title: '招待エラー',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };
  
  // 招待取り消し
  const handleCancelInvitation = async (invitationId: string, skipConfirmation = false) => {
    try {
      if (!skipConfirmation && !confirm('本当にこの招待を取り消しますか？')) {
        return;
      }
      
      setLoading(true);
      
      // 招待を削除
      const { error } = await supabase
        .from('user_invitations')
        .delete()
        .eq('id', invitationId);
      
      if (error) throw new Error(error.message);
      
      // 招待リストを更新
      setInvitations(invitations.filter(inv => inv.id !== invitationId));
      
      toast({
        title: '招待取り消し完了',
        description: '招待を取り消しました。',
      });
    } catch (error: any) {
      console.error('招待取り消しエラー:', error);
      toast({
        title: '招待取り消しエラー',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };
  
  // ユーザーの停止/有効化
  const handleToggleUserActive = async (userId: string, isActive: boolean) => {
    try {
      setLoading(true);
      
      // ユーザーの状態を更新
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !isActive })
        .eq('id', userId);
      
      if (error) throw new Error(error.message);
      
      // ユーザーリストを更新
      setUsers(users.map(user => 
        user.id === userId ? { ...user, is_active: !isActive } : user
      ));
      
      toast({
        title: isActive ? 'ユーザー停止完了' : 'ユーザー有効化完了',
        description: isActive ? 'ユーザーを停止しました。' : 'ユーザーを有効化しました。',
      });
      
    } catch (error: any) {
      toast({
        title: 'ユーザー状態変更エラー',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };
  
  // ユーザーロール変更
  const handleChangeUserRole = async (userId: string, newRole: string) => {
    try {
      setLoading(true);
      
      // ユーザーのロールを更新
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);
      
      if (error) throw new Error(error.message);
      
      // ユーザーリストを更新
      setUsers(users.map(user => 
        user.id === userId ? { ...user, role: newRole } : user
      ));
      
      toast({
        title: 'ロール変更完了',
        description: 'ユーザーのロールを変更しました。',
      });
      
    } catch (error: any) {
      toast({
        title: 'ロール変更エラー',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };
  
  // 招待の期限を表示するフォーマッター
  const formatExpiryDate = (expiresAt: string) => {
    const date = new Date(expiresAt);
    return date.toLocaleString('ja-JP');
  };
  
  // ロール名を日本語に変換
  const getRoleName = (roleValue: string) => {
    const role = ROLE_OPTIONS.find(r => r.value === roleValue);
    return role ? role.label : roleValue;
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50">
      <AppHeader 
        showBackButton={true}
        title="ユーザー管理"
        icon={<Users className="h-6 w-6 text-pink-400" />}
      />
      
      {isCheckingAuth ? (
        <div className="flex justify-center items-center h-screen">
          <LoadingUI />
        </div>
      ) : isAuthorized ? (
        <div className="container max-w-5xl mx-auto px-4 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-6 grid w-full grid-cols-3 bg-pink-100 p-1">
              <TabsTrigger 
                value="invite" 
                className="data-[state=active]:bg-white data-[state=active]:text-pink-800"
              >
                ユーザー招待
              </TabsTrigger>
              <TabsTrigger 
                value="invitations" 
                className="data-[state=active]:bg-white data-[state=active]:text-pink-800"
              >
                招待リスト
              </TabsTrigger>
              <TabsTrigger 
                value="users" 
                className="data-[state=active]:bg-white data-[state=active]:text-pink-800"
              >
                ユーザーリスト
              </TabsTrigger>
            </TabsList>
            
            {/* 招待フォーム */}
            <TabsContent value="invite">
              <Card className="border-pink-200 shadow-md">
                <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-t-lg">
                  <CardTitle className="flex items-center gap-2 text-pink-800">
                    <Users className="h-5 w-5" />
                    新規ユーザー招待
                  </CardTitle>
                  <CardDescription>
                    新しいユーザーを招待します。招待メールが送信されます。
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleInvite}>
                  <CardContent className="pt-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-pink-800">メールアドレス</Label>
                      <Input 
                        id="email" 
                        type="email" 
                        placeholder="例: user@example.com" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="border-pink-200 focus:border-pink-500 focus:ring-pink-500"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="role" className="text-pink-800">ロール</Label>
                      <select
                        id="role"
                        className="w-full p-2 border rounded bg-white border-pink-200 focus:border-pink-500 focus:ring-pink-500 text-sm"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        required
                      >
                        {ROLE_OPTIONS
                          .filter(option => currentUserRole === 'superuser' || option.value !== 'superuser')
                          .map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                      </select>
                    </div>
                  </CardContent>
                  <CardFooter className="bg-pink-50">
                    <Button
                      type="submit"
                      disabled={loading}
                      className="bg-pink-600 hover:bg-pink-700"
                    >
                      {loading ? '処理中...' : '招待を送信'}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </TabsContent>
            
            {/* 招待リスト */}
            <TabsContent value="invitations">
              <Card className="border-pink-200 shadow-md">
                <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-t-lg">
                  <CardTitle className="flex items-center gap-2 text-pink-800">
                    <Users className="h-5 w-5" />
                    招待リスト
                  </CardTitle>
                  <CardDescription>
                    送信済みの招待一覧です。
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  {loading ? (
                    <div className="flex justify-center items-center py-10">
                      <LoadingUI />
                    </div>
                  ) : invitations.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                      招待はありません
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-pink-200 bg-pink-50">
                            <th className="p-2 text-left text-pink-800">メールアドレス</th>
                            <th className="p-2 text-left text-pink-800">ロール</th>
                            <th className="p-2 text-left text-pink-800">施設</th>
                            <th className="p-2 text-left text-pink-800">有効期限</th>
                            <th className="p-2 text-left text-pink-800">状態</th>
                            <th className="p-2 text-left text-pink-800">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invitations.map((invitation) => (
                            <tr key={invitation.id} className="border-b border-pink-100 hover:bg-pink-50">
                              <td className="p-2">{invitation.email}</td>
                              <td className="p-2">{getRoleName(invitation.role)}</td>
                              <td className="p-2">{invitation.facilities?.name}</td>
                              <td className="p-2">{formatExpiryDate(invitation.expires_at)}</td>
                              <td className="p-2">
                                {invitation.is_used ? (
                                  <span className="text-green-600">使用済み</span>
                                ) : new Date(invitation.expires_at) < new Date() ? (
                                  <span className="text-red-600">期限切れ</span>
                                ) : (
                                  <span className="text-blue-600">有効</span>
                                )}
                              </td>
                              <td className="p-2">
                                {!invitation.is_used && new Date(invitation.expires_at) >= new Date() && (
                                  <Button 
                                    variant="destructive" 
                                    size="sm" 
                                    onClick={() => handleCancelInvitation(invitation.id)}
                                    className="bg-pink-600 hover:bg-pink-700"
                                  >
                                    取消
                                  </Button>
                                )}
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
            
            {/* ユーザーリスト */}
            <TabsContent value="users">
              <Card className="border-pink-200 shadow-md">
                <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-t-lg">
                  <CardTitle className="flex items-center gap-2 text-pink-800">
                    <Users className="h-5 w-5" />
                    ユーザーリスト
                  </CardTitle>
                  <CardDescription>
                    登録済みのユーザー一覧です。
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  {loading ? (
                    <div className="flex justify-center items-center py-10">
                      <LoadingUI />
                    </div>
                  ) : users.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                      ユーザーはいません
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-pink-200 bg-pink-50">
                            <th className="p-2 text-left text-pink-800">名前</th>
                            <th className="p-2 text-left text-pink-800">メールアドレス</th>
                            <th className="p-2 text-left text-pink-800">ロール</th>
                            <th className="p-2 text-left text-pink-800">施設</th>
                            <th className="p-2 text-left text-pink-800">状態</th>
                            <th className="p-2 text-left text-pink-800">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((user) => (
                            <tr key={user.id} className="border-b border-pink-100 hover:bg-pink-50">
                              <td className="p-2">{user.full_name || '-'}</td>
                              <td className="p-2">{user.email}</td>
                              <td className="p-2">
                                <select
                                  value={user.role}
                                  onChange={(e) => handleChangeUserRole(user.id, e.target.value)}
                                  className="p-1 border border-pink-200 rounded focus:border-pink-500 focus:ring-pink-500 text-sm w-full"
                                  disabled={loading}
                                >
                                  {ROLE_OPTIONS
                                    .filter(option => currentUserRole === 'superuser' || option.value !== 'superuser')
                                    .map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                </select>
                              </td>
                              <td className="p-2">{user.facilities?.name}</td>
                              <td className="p-2">
                                {user.is_active ? (
                                  <span className="text-green-600">有効</span>
                                ) : (
                                  <span className="text-red-600">停止中</span>
                                )}
                              </td>
                              <td className="p-2">
                                <Button 
                                  variant={user.is_active ? "destructive" : "default"} 
                                  size="sm" 
                                  onClick={() => handleToggleUserActive(user.id, user.is_active)}
                                  disabled={loading}
                                  className={user.is_active ? "bg-pink-600 hover:bg-pink-700" : "bg-pink-500 hover:bg-pink-600"}
                                >
                                  {user.is_active ? '停止' : '有効化'}
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
      ) : (
        <div className="flex justify-center items-center h-screen">
          <Card className="border-pink-200 shadow-md max-w-md">
            <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-t-lg">
              <CardTitle className="text-pink-800">アクセス権限がありません</CardTitle>
              <CardDescription>
                このページにアクセスするには管理者権限が必要です。
              </CardDescription>
            </CardHeader>
            <CardFooter className="bg-pink-50">
              <Button 
                onClick={() => router.push('/depart')}
                className="bg-pink-600 hover:bg-pink-700"
              >
                ホームに戻る
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
} 