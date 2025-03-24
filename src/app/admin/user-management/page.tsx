'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
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
  { value: 'facility_admin', label: '施設管理者' },
  { value: 'approver', label: '承認者' },
  { value: 'regular_user', label: '一般ユーザー' }
];

export default function UserManagement() {
  const supabase = createClient();
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
  }, [supabase, router, toast]);
  
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
  }, [supabase]);
  
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
  }, [supabase, currentUserFacilityId]);
  
  // 招待リストと既存ユーザーの取得
  useEffect(() => {
    async function fetchInvitationsAndUsers() {
      setLoading(true);
      
      try {
        // 招待リストの取得
        const { data: invitationsData, error: invitationsError } = await supabase
          .from('user_invitations')
          .select(`
            *,
            facilities(name),
            invited_by_profiles:profiles!user_invitations_invited_by_fkey(full_name, username)
          `)
          .order('created_at', { ascending: false });
        
        if (invitationsError) {
          console.error('招待リスト取得エラー:', invitationsError);
        } else {
          // 招待データに部門情報を追加
          if (invitationsData && invitationsData.length > 0) {
            // 部門IDを持つ招待だけフィルタリング
            const invitationsWithDeptIds = invitationsData.filter(inv => inv.department_id);
            
            if (invitationsWithDeptIds.length > 0) {
              // 部門情報を別途取得
              const { data: departmentsData } = await supabase
                .from('departments')
                .select('id, name')
                .in('id', invitationsWithDeptIds.map(inv => inv.department_id));
              
              // 招待データに部門情報をマージ
              const enrichedInvitations = invitationsData.map(invitation => {
                if (invitation.department_id && departmentsData) {
                  const department = departmentsData.find(dept => dept.id === invitation.department_id);
                  return {
                    ...invitation,
                    departments: department || null
                  };
                }
                return {
                  ...invitation,
                  departments: null
                };
              });
              
              setInvitations(enrichedInvitations);
            } else {
              setInvitations(invitationsData);
            }
          } else {
            setInvitations([]);
          }
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
          // ユーザーデータに部門情報を追加
          if (usersData && usersData.length > 0) {
            // 部門IDを持つユーザーだけフィルタリング
            const usersWithDeptIds = usersData.filter(user => user.department_id);
            
            if (usersWithDeptIds.length > 0) {
              // 部門情報を別途取得
              const { data: departmentsData } = await supabase
                .from('departments')
                .select('id, name')
                .in('id', usersWithDeptIds.map(user => user.department_id));
              
              // ユーザーデータに部門情報をマージ
              const enrichedUsers = usersData.map(user => {
                if (user.department_id && departmentsData) {
                  const department = departmentsData.find(dept => dept.id === user.department_id);
                  return {
                    ...user,
                    departments: department || null
                  };
                }
                return {
                  ...user,
                  departments: null
                };
              });
              
              setUsers(enrichedUsers);
            } else {
              setUsers(usersData);
            }
          } else {
            setUsers([]);
          }
        }
      } catch (error) {
        console.error('データ取得エラー:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchInvitationsAndUsers();
  }, [supabase, activeTab]);
  
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
          departmentId: departmentId || null
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || '招待処理中にエラーが発生しました');
      }
      
      // 成功メッセージ
      toast({
        title: '招待メール送信完了',
        description: `${email}に招待メールを送信しました。`,
      });
      
      // フォームをリセット
      setEmail('');
      setRole('regular_user');
      setDepartmentId('');
      
      // 招待リストを更新
      const { data: invitationsData } = await supabase
        .from('user_invitations')
        .select(`
          *,
          facilities(name),
          departments(name),
          invited_by_profiles:profiles!user_invitations_invited_by_fkey(full_name, username)
        `)
        .order('created_at', { ascending: false });
      
      setInvitations(invitationsData || []);
      
    } catch (error: any) {
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
  const handleCancelInvitation = async (invitationId: string) => {
    try {
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
    <div className="min-h-screen bg-white">
      <AppHeader 
        showBackButton={true}
        title="ユーザー管理"
        icon={<Users className="h-6 w-6 text-primary" />}
      />
      
      {isCheckingAuth ? (
        <div className="flex justify-center items-center h-screen">
          <p>認証確認中...</p>
        </div>
      ) : isAuthorized ? (
        <div className="container mx-auto p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="invite">ユーザー招待</TabsTrigger>
              <TabsTrigger value="invitations">招待リスト</TabsTrigger>
              <TabsTrigger value="users">ユーザーリスト</TabsTrigger>
            </TabsList>
            
            {/* 招待フォーム */}
            <TabsContent value="invite">
              <Card>
                <CardHeader>
                  <CardTitle>新規ユーザー招待</CardTitle>
                  <CardDescription>
                    新しいユーザーを招待します。招待メールが送信されます。
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleInvite}>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">メールアドレス</Label>
                      <Input 
                        id="email" 
                        type="email" 
                        placeholder="例: user@example.com" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="role">ロール</Label>
                      <select
                        id="role"
                        className="w-full p-2 border rounded"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        required
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="department">部門（任意）</Label>
                      <select
                        id="department"
                        className="w-full p-2 border rounded"
                        value={departmentId}
                        onChange={(e) => setDepartmentId(e.target.value)}
                      >
                        <option value="">部門を選択してください</option>
                        {departments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" disabled={loading}>
                      {loading ? '処理中...' : '招待を送信'}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </TabsContent>
            
            {/* 招待リスト */}
            <TabsContent value="invitations">
              <Card>
                <CardHeader>
                  <CardTitle>招待リスト</CardTitle>
                  <CardDescription>
                    送信済みの招待一覧です。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <p className="text-center">読み込み中...</p>
                  ) : invitations.length === 0 ? (
                    <p className="text-center">招待はありません</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="p-2 text-left">メールアドレス</th>
                            <th className="p-2 text-left">ロール</th>
                            <th className="p-2 text-left">施設</th>
                            <th className="p-2 text-left">部門</th>
                            <th className="p-2 text-left">有効期限</th>
                            <th className="p-2 text-left">状態</th>
                            <th className="p-2 text-left">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invitations.map((invitation) => (
                            <tr key={invitation.id} className="border-b hover:bg-gray-50">
                              <td className="p-2">{invitation.email}</td>
                              <td className="p-2">{getRoleName(invitation.role)}</td>
                              <td className="p-2">{invitation.facilities?.name}</td>
                              <td className="p-2">{invitation.departments?.name || '-'}</td>
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
              <Card>
                <CardHeader>
                  <CardTitle>ユーザーリスト</CardTitle>
                  <CardDescription>
                    登録済みのユーザー一覧です。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <p className="text-center">読み込み中...</p>
                  ) : users.length === 0 ? (
                    <p className="text-center">ユーザーはいません</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="p-2 text-left">名前</th>
                            <th className="p-2 text-left">メールアドレス</th>
                            <th className="p-2 text-left">ロール</th>
                            <th className="p-2 text-left">施設</th>
                            <th className="p-2 text-left">部門</th>
                            <th className="p-2 text-left">状態</th>
                            <th className="p-2 text-left">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((user) => (
                            <tr key={user.id} className="border-b hover:bg-gray-50">
                              <td className="p-2">{user.full_name || '-'}</td>
                              <td className="p-2">{user.email}</td>
                              <td className="p-2">
                                <select
                                  value={user.role}
                                  onChange={(e) => handleChangeUserRole(user.id, e.target.value)}
                                  className="p-1 border rounded"
                                  disabled={loading}
                                >
                                  {ROLE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="p-2">{user.facilities?.name}</td>
                              <td className="p-2">{user.departments?.name || '-'}</td>
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
          <Card>
            <CardHeader>
              <CardTitle>アクセス権限がありません</CardTitle>
              <CardDescription>
                このページにアクセスするには管理者権限が必要です。
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button onClick={() => router.push('/depart')}>
                ホームに戻る
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
} 