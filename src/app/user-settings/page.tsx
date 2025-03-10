"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/ui/app-header";

type FormValues = {
  fullname: string;
};

interface Facility {
  id: string;
  name: string;
}

export default function UserSettings() {
  const { user, profile, updateProfile } = useAuth();
  const { register, handleSubmit, setValue } = useForm<FormValues>();
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
      setValue("fullname", profile.fullname || "");
      
      // 施設IDが設定されている場合、選択された施設を設定
      if (profile.facility_id) {
        fetchSelectedFacility(profile.facility_id);
      }
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
      const response = await fetch('/hospital_facilities.json');
      const data = await response.json();
      
      if (data.facilities[facilityId]) {
        setSelectedFacility({
          id: facilityId,
          name: data.facilities[facilityId].name
        });
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

      // フルネームが入力されていない場合はエラー
      if (!data.fullname.trim()) {
        setError("氏名は必須です。");
        return;
      }

      // 施設が選択されていない場合はエラー
      if (!selectedFacility) {
        setError("施設を選択してください。");
        return;
      }

      // プロファイル情報を更新
      const { error } = await updateProfile({
        fullname: data.fullname,
        facility_id: selectedFacility.id
      });

      if (error) {
        setError(error.message);
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
    <div className="min-h-screen bg-gradient-to-b from-[#fde3f1] to-[#e9ddfc]">
      <AppHeader showBackButton={false} title="ユーザー設定" />
      
      <div className="container mx-auto p-4 space-y-6">
        <Card className="w-full max-w-md mx-auto mt-8">
          <CardHeader>
            <CardTitle>プロファイル情報</CardTitle>
          </CardHeader>
          <CardContent>
            {/* 現在のプロファイル情報の表示 */}
            {profile && (
              <div className="mb-6 space-y-2">
                <p className="text-sm text-gray-600">
                  メールアドレス: {user?.email}
                </p>
                {profile.fullname && (
                  <p className="text-sm text-gray-600">
                    現在の氏名: {profile.fullname}
                  </p>
                )}
                {selectedFacility ? (
                  <p className="text-sm text-gray-600">
                    所属施設: {selectedFacility.name}
                  </p>
                ) : profile.facility_id ? (
                  <p className="text-sm text-gray-600">
                    施設ID: {profile.facility_id}
                  </p>
                ) : (
                  <div className="p-3 bg-yellow-50 border border-yellow-300 rounded-md">
                    <div className="flex items-start">
                      <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2 mt-0.5" />
                      <p className="text-sm text-yellow-700">
                        所属施設が登録されていません。
                        施設を選択してください。
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="fullname">氏名（フルネーム）</Label>
                <Input
                  id="fullname"
                  type="text"
                  placeholder="例: 山田 太郎"
                  {...register("fullname", { required: "氏名は必須です" })}
                />
                <p className="text-sm text-gray-500 mt-1">
                  ※この名前は試薬登録時の署名として利用されます。
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="facility">所属施設</Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                  <Input
                    id="facility"
                    type="text"
                    placeholder="施設名を検索"
                    value={facilitySearchTerm}
                    onChange={handleFacilitySearch}
                    onFocus={() => setShowFacilityDropdown(true)}
                    className="pl-10"
                  />
                  
                  {showFacilityDropdown && filteredFacilities.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white shadow-lg rounded-md max-h-60 overflow-auto">
                      {filteredFacilities.map(facility => (
                        <div
                          key={facility.id}
                          className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                          onClick={() => handleSelectFacility(facility)}
                        >
                          {facility.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {selectedFacility && (
                  <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-sm text-blue-700">
                      選択中: {selectedFacility.name}
                    </p>
                  </div>
                )}
                
                <p className="text-sm text-gray-500">
                  ※所属施設を選択してください。施設名の一部を入力すると候補が表示されます。
                </p>
              </div>
              
              {error && (
                <div className="p-3 bg-red-50 border border-red-300 rounded-md">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              
              {message && (
                <div className="p-3 bg-green-50 border border-green-300 rounded-md">
                  <p className="text-sm text-green-700">{message}</p>
                </div>
              )}
              
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "更新中..." : "更新"}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={handleBackToDashboard}
              disabled={!profile?.fullname || !profile?.facility_id}
            >
              ダッシュボードへ戻る
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
