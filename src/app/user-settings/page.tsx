"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Search, UserRound, Mail, Building, Sprout, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/ui/app-header";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import supabase from "@/lib/supabaseClient";

type FormValues = {
  lastName: string;
  firstName: string;
};

interface Facility {
  id: string;
  name: string;
}

export default function UserSettings() {
  const { user, profile, updateProfile } = useAuth();
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>();
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  
  // 施設関連の状態
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [filteredFacilities, setFilteredFacilities] = useState<Facility[]>([]);
  const [facilitySearchTerm, setFacilitySearchTerm] = useState("");
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [showFacilityDropdown, setShowFacilityDropdown] = useState(false);

  useEffect(() => {
    if (profile) {
      // フルネームを姓と名に分割
      const fullnameParts = (profile.fullname || "").split(" ");
      setValue("lastName", fullnameParts[0] || "");
      setValue("firstName", fullnameParts[1] || "");
      
      // 施設IDが設定されている場合、選択された施設を設定
      if (profile.facility_id) {
        console.log("プロファイルから施設ID検出: ", profile.facility_id);
        fetchSelectedFacility(profile.facility_id);
      } else {
        console.log("プロファイルに施設IDがありません");
      }
    } else {
      console.log("プロファイルがロードされていません");
    }
  }, [profile, setValue]);

  // 施設データの読み込み
  useEffect(() => {
    const loadFacilities = async () => {
      try {
        const response = await fetch('/hospital_facilities.json');
        const data = await response.json();
        
        // JSONデータを配列に変換
        const facilitiesArray: Facility[] = Object.entries(data.facilities).map(
          ([id, facility]: [string, any]) => ({
            id,
            name: facility.name
          })
        );
        
        setFacilities(facilitiesArray);
      } catch (error) {
        console.error('施設データの読み込みに失敗しました:', error);
        setError('施設データの読み込みに失敗しました。');
      }
    };
    
    loadFacilities();
  }, []);

  // 選択された施設の詳細を取得
  const fetchSelectedFacility = async (facilityId: string) => {
    try {
      console.log("施設ID取得: ", facilityId);
      const response = await fetch('/hospital_facilities.json');
      const data = await response.json();
      
      if (data.facilities[facilityId]) {
        console.log("施設名取得成功: ", data.facilities[facilityId].name);
        setSelectedFacility({
          id: facilityId,
          name: data.facilities[facilityId].name
        });
      } else {
        // 施設IDはあるが、JSONデータに該当施設がない場合
        console.log("施設IDに対応する施設データがありません");
        // Supabaseから直接施設情報を取得してみる
        const { data: facilityData, error: facilityError } = await supabase
          .from("facilities")
          .select("name")
          .eq("id", facilityId)
          .single();
          
        if (!facilityError && facilityData) {
          console.log("Supabaseから施設名取得成功: ", facilityData.name);
          setSelectedFacility({
            id: facilityId,
            name: facilityData.name
          });
        }
      }
    } catch (error) {
      console.error('施設情報の取得に失敗しました:', error);
    }
  };

  // 施設検索の処理
  const handleFacilitySearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchTerm = e.target.value;
    setFacilitySearchTerm(searchTerm);
    
    if (searchTerm.trim() === '') {
      setFilteredFacilities([]);
      return;
    }
    
    // 検索語を含む施設をフィルタリング
    const filtered = facilities.filter(facility => 
      facility.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    setFilteredFacilities(filtered);
    setShowFacilityDropdown(true);
  };

  // 施設選択の処理
  const handleSelectFacility = (facility: Facility) => {
    setSelectedFacility(facility);
    setFacilitySearchTerm("");
    setShowFacilityDropdown(false);
  };

  const onSubmit = async (data: FormValues) => {
    try {
      setLoading(true);
      setError("");
      setMessage("");

      // 姓と名が入力されていない場合はエラー
      if (!data.lastName.trim() || !data.firstName.trim()) {
        setError("姓と名を入力してください。");
        return;
      }

      // 施設が選択されていない場合はエラー
      if (!selectedFacility) {
        setError("施設を選択してください。");
        return;
      }

      // 姓と名を連結してフルネームを作成
      const fullname = `${data.lastName} ${data.firstName}`;

      // プロファイル情報を更新
      const { error } = await updateProfile({
        fullname: fullname,
        facility_id: selectedFacility.id
      });

      if (error) {
        setError(error.message);
        
        // プロファイル更新エラーの場合、直接Supabaseを使用して新規作成を試みる
        if (user && user.id) {
          console.log("プロファイル更新エラー、直接DBへの挿入を試みます");
          
          const profileData = {
            id: user.id,
            fullname: fullname,
            facility_id: selectedFacility.id,
            email: user.email,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          // まずupsertを試す
          const { error: upsertError } = await supabase
            .from('profiles')
            .upsert(profileData);
          
          if (upsertError) {
            console.error("Supabase upsertエラー:", upsertError);
            
            // upsertに失敗した場合はinsertを試す
            const { error: insertError } = await supabase
              .from('profiles')
              .insert(profileData);
            
            if (insertError) {
              console.error("Supabase insertエラー:", insertError);
            } else {
              setMessage("プロファイル情報が作成されました");
              // 成功したらページをリロード
              window.location.reload();
            }
          } else {
            setMessage("プロファイル情報が作成されました");
            // 成功したらページをリロード
            window.location.reload();
          }
        }
      } else {
        setMessage("プロファイル情報が更新されました");
      }
    } catch (err: any) {
      setError(err.message || "更新中にエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToDashboard = () => {
    // プロファイル情報が完全に設定されている場合のみダッシュボードに戻れる
    if (profile?.fullname && profile?.facility_id) {
      router.push("/depart");
    } else {
      setError("プロファイル情報を完全に設定してからダッシュボードに戻ってください");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50">
      <AppHeader 
        showBackButton={true} 
        title="Your Profile" 
        icon={<UserRound className="h-6 w-6 text-pink-400" />}
      />
      
      <div className="container mx-auto px-4 py-6">
        <Card className="max-w-md mx-auto mt-8 border-pink-200 shadow-md">
          <CardHeader className="bg-gradient-to-r from-pink-100 to-purple-100 rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-pink-800">
              <UserRound className="h-5 w-5" />
              ユーザー設定
            </CardTitle>
            <CardDescription>プロフィール情報の確認と更新</CardDescription>
          </CardHeader>
          
          <CardContent className="pt-6">
            {/* 現在の設定表示 */}
            <div className="mb-6 bg-pink-50 p-4 rounded-lg border border-pink-100">
              <h3 className="text-sm font-medium text-pink-800 mb-3 flex items-center">
                <Sprout className="h-4 w-4 mr-2 text-pink-500" />
                現在の設定
              </h3>

              <div className="space-y-2 text-sm">
                <div className="flex items-start">
                  <UserRound className="h-4 w-4 mr-2 text-pink-400 mt-0.5" />
                  <div>
                    <p className="text-gray-500">氏名</p>
                    <p className="font-medium">{profile?.fullname || "未設定"}</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <Mail className="h-4 w-4 mr-2 text-pink-400 mt-0.5" />
                  <div>
                    <p className="text-gray-500">メールアドレス</p>
                    <p className="font-medium">{user?.email || "未設定"}</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <Building className="h-4 w-4 mr-2 text-pink-400 mt-0.5" />
                  <div>
                    <p className="text-gray-500">所属施設</p>
                    <p className="font-medium">{selectedFacility?.name || "未設定"}</p>
                  </div>
                </div>
              </div>
            </div>

            <Separator className="my-4 bg-pink-100" />

            {/* 更新フォーム */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <h3 className="text-sm font-medium text-pink-800 mb-2">設定を変更する</h3>

              {/* 姓と名の入力 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lastName" className="text-pink-700">
                    姓
                  </Label>
                  <Input
                    id="lastName"
                    className="border-pink-200 focus:border-pink-400 focus:ring-pink-400"
                    placeholder="姓"
                    {...register("lastName", { required: "姓を入力してください" })}
                  />
                  {errors.lastName && <p className="text-xs text-red-500">{errors.lastName.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="firstName" className="text-pink-700">
                    名
                  </Label>
                  <Input
                    id="firstName"
                    className="border-pink-200 focus:border-pink-400 focus:ring-pink-400"
                    placeholder="名"
                    {...register("firstName", { required: "名を入力してください" })}
                  />
                  {errors.firstName && <p className="text-xs text-red-500">{errors.firstName.message}</p>}
                </div>
              </div>

              {/* 施設選択 */}
              <div className="space-y-2">
                <Label htmlFor="facility" className="text-pink-700">
                  所属施設
                </Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-pink-400" />
                  </div>
                  <Input
                    id="facility"
                    type="text"
                    placeholder="施設名を検索"
                    value={facilitySearchTerm}
                    onChange={handleFacilitySearch}
                    onFocus={() => setShowFacilityDropdown(true)}
                    className="pl-10 border-pink-200 focus:border-pink-400 focus:ring-pink-400"
                  />
                  
                  {showFacilityDropdown && filteredFacilities.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white shadow-lg rounded-md max-h-60 overflow-auto border border-pink-100">
                      {filteredFacilities.map(facility => (
                        <div
                          key={facility.id}
                          className="px-4 py-2 hover:bg-pink-50 cursor-pointer"
                          onClick={() => handleSelectFacility(facility)}
                        >
                          {facility.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {selectedFacility && (
                  <div className="mt-2 p-2 bg-pink-50 border border-pink-100 rounded-md">
                    <p className="text-sm text-pink-700 flex items-center">
                      <Building className="h-4 w-4 mr-2 text-pink-500" />
                      選択中: {selectedFacility.name}
                    </p>
                  </div>
                )}
                
                <p className="text-xs text-gray-500">
                  ※所属施設を選択してください。施設名の一部を入力すると候補が表示されます。
                </p>
              </div>
              
              {/* エラーメッセージ */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700 flex items-center">
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    {error}
                  </p>
                </div>
              )}
              
              {/* 成功メッセージ */}
              {message && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-700">
                    {message}
                  </p>
                </div>
              )}
              
              {/* 送信ボタン */}
              <motion.div
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-pink-400 to-purple-500 hover:from-pink-500 hover:to-purple-600 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
                  disabled={loading}
                >
                  {loading ? "更新中..." : "設定を保存"}
                  {!loading && <ArrowRight className="ml-2 h-5 w-5" />}
                </Button>
              </motion.div>
              
              {/* ダッシュボードへ戻るボタン */}
              <motion.div
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                className="mt-3"
              >
                <Button 
                  variant="outline"
                  onClick={handleBackToDashboard}
                  disabled={!profile?.fullname || !profile?.facility_id}
                  className="w-full border-pink-200 text-pink-700 hover:bg-pink-50 rounded-xl"
                >
                  ダッシュボードへ戻る
                </Button>
              </motion.div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
