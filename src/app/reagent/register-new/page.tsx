"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useForm } from "react-hook-form";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useToast } from "@/hooks/use-toast";
import BarcodeScanner from "@/components/BarcodeScanner";
import { AppHeader } from "@/components/ui/app-header";
import { TooltipProvider } from "@/components/ui/tooltip";

type FormValues = {
  department: string;
  departmentId: string; // 部署IDを追加
  reagentName: string;
  specification: string;
  lotNo: string;
  expirationDate: string;
  // 追加: JANコード欄
  janCode?: string;
  // 追加: 単位欄
  unit: string;
};

interface Product {
  code: string; // JAN/EAN/GTINなど
  name: string;
  specification: string; // 規格
  unit: string; // 単位
}

// SearchParamsを取得するコンポーネント
function ReagentRegistrationContent() {
  // 認証チェック
  useRequireAuth();
  
  const { register, setValue, getValues, reset, formState: { /* errors */ } } = useForm<FormValues>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const departmentName = searchParams?.get('department') || '';
  const departmentId = searchParams?.get('departmentId') || '';
  
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showCamera, setShowCamera] = useState<boolean>(true);
  const { toast } = useToast(); // トースト通知を使用
  
  // 部署一覧、商品CSV、バーコード読み取り状況
  // 部署一覧は現在使用していませんが、将来的に部署選択機能を実装する予定
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [departments, setDepartments] = useState<{id: string, name: string}[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  // バーコード検出状態は内部的に使用
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [barcodeDetected, setBarcodeDetected] = useState<boolean>(false);
  
  // デバッグログ
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const addDebugLog = useCallback((message: string) => {
    console.log(message); // コンソールにも出力
    setDebugLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  }, []);

  // URLパラメータから部署情報を設定
  useEffect(() => {
    if (departmentName && departmentId) {
      addDebugLog(`URLパラメータから部署情報を設定: ${departmentName} (ID: ${departmentId})`);
      setValue("department", departmentName);
      setValue("departmentId", departmentId);
    }
  }, [departmentName, departmentId, setValue, addDebugLog]);

  // 試薬登録処理
  const registerReagent = async (startUsage: boolean) => {
    try {
      setIsSubmitting(true);
      setError("");
      
      const formValues = getValues();
      addDebugLog("フォーム値: " + JSON.stringify(formValues));
      
      // ユーザー情報取得
      addDebugLog("ユーザー情報取得開始");
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) {
        addDebugLog("ユーザーIDが取得できません");
        setError("ユーザー情報の取得に失敗しました");
        return;
      }
      addDebugLog("ユーザー情報取得成功: " + userData.user.id);
      
      // ユーザーのプロファイルから施設IDを取得
      addDebugLog("ユーザープロファイル取得開始");
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("facility_id")
        .eq("id", userData.user.id)
        .single();
        
      if (profileError || !profileData) {
        addDebugLog("プロファイル取得エラー: " + JSON.stringify(profileError));
        setError("ユーザープロファイルの取得に失敗しました");
        return;
      }
      
      if (!profileData.facility_id) {
        addDebugLog("ユーザーに施設IDが設定されていません");
        setError("ユーザーに施設が設定されていません。管理者に連絡してください。");
        return;
      }
      
      addDebugLog("ユーザー施設ID: " + profileData.facility_id);
      
      // 試薬データ作成（カラム名の大文字小文字に注意）
      const reagentData = {
        department: formValues.department,
        name: formValues.reagentName,
        specification: formValues.specification || "",
        "lotNo": formValues.lotNo, // 大文字小文字を正確に
        "expirationDate": formValues.expirationDate, // 大文字小文字を正確に
        "registrationDate": new Date().toISOString(), // 大文字小文字を正確に
        "registeredBy": userData.user.id, // 大文字小文字を正確に
        used: startUsage,
        "used_at": startUsage ? new Date().toISOString() : null,
        "used_by": startUsage ? userData.user.id : null,
        unit: formValues.unit || "", // 単位（フォームから取得）
        facility_id: profileData.facility_id, // ユーザープロファイルから取得した施設ID
        jan_code: formValues.janCode || "", // JANコード
      };
      addDebugLog("試薬データ作成: " + JSON.stringify(reagentData));

      // 試薬データの登録
      addDebugLog("試薬データ登録開始");
      const { data: reagentDataInserted, error: reagentError } = await supabase
        .from("reagents")
        .insert([reagentData])
        .select();

      if (reagentError) {
        addDebugLog("試薬データ登録エラー: " + JSON.stringify(reagentError));
        setError("試薬データの登録に失敗しました");
        return;
      }

      addDebugLog("試薬データ登録成功: " + JSON.stringify(reagentDataInserted));

      // トースト通知（正しい書式で）
      toast({
        title: "登録完了",
        description: "試薬の登録が完了しました",
        duration: 3000,
      });

      // フォームをリセット
      reset();
      
      // 少し待ってからリダイレクト
      setTimeout(() => {
        router.push("/reagent_dash");
      }, 1500);
    } catch (error) {
      addDebugLog("試薬登録エラー: " + JSON.stringify(error));
      setError("試薬登録中にエラーが発生しました。後でもう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  };

  // GS1バーコードのパース
  const parseGS1Barcode = useCallback(
    (originalBarcode: string) => {
      // バーコードの前処理（スペースや特殊文字を削除）
      const cleanBarcode = originalBarcode.replace(/[\s\-]/g, "");
      addDebugLog("バーコード認識: " + cleanBarcode);
      
      // GS1-128形式のバーコードをパース
      // 例: 01049123451234520510ABCD1234
      // 01: GTIN (14桁)
      // 17: 有効期限 (YYMMDD)
      // 10: ロット番号 (可変長)
      
      // より柔軟な正規表現パターン
      const gs1Regex = /01(\d{14}).*?17(\d{6}).*?10([A-Za-z0-9]+)/;
      const match = cleanBarcode.match(gs1Regex);
      
      addDebugLog("正規表現パターン: " + gs1Regex);
      
      if (match) {
        const gtin = match[1];
        const expiryRaw = match[2];
        const lot = match[3];
        addDebugLog("GTIN: " + gtin);
        addDebugLog("生の有効期限: " + expiryRaw);
        addDebugLog("ロット番号: " + lot);

        // YY(>=50なら1900年代、<50なら2000年代) としてパース
        const yearPrefix = parseInt(expiryRaw.substring(0, 2)) >= 50 ? "19" : "20";
        const formattedExpiry = `${yearPrefix}${expiryRaw.substring(0, 2)}-${expiryRaw.substring(
          2,
          4
        )}-${expiryRaw.substring(4, 6)}`;
        setValue("expirationDate", formattedExpiry);
        
        // ロット番号の処理
        setValue("lotNo", lot);
        
        // GTIN/JANを設定
        setValue("janCode", gtin);

        // 商品マスタから検索
        const product = products.find((p) => p.code === gtin);
        if (product) {
          setValue("reagentName", product.name);
          setValue("specification", product.specification || "規格未設定");
          setValue("unit", product.unit || "");
          addDebugLog("GTIN/JANコード一致: " + product.name);
          addDebugLog("規格: " + (product.specification || "規格未設定"));
          addDebugLog("単位: " + (product.unit || "未設定"));
        } else {
          addDebugLog("GTIN/JANコード不一致: " + gtin);
        }
        
        setBarcodeDetected(true);
        return true;
      } else {
        addDebugLog("GS1-128バーコードとして認識できませんでした。別のパターンを試します。");
        
        // 他のバーコードパターンを試す
        const fallbackRegex = /(01)?(\d{14})(17)?(\d{6})?(10)?([A-Za-z0-9]+)?/;
        const fallbackMatch = cleanBarcode.match(fallbackRegex);
        
        if (fallbackMatch) {
          addDebugLog("代替パターンでマッチ: " + JSON.stringify(fallbackMatch));
          const gtin = fallbackMatch[2];
          const expiryRaw = fallbackMatch[4];
          const lot = fallbackMatch[6];
          
          addDebugLog("代替GTIN: " + gtin);
          if (expiryRaw) addDebugLog("代替有効期限: " + expiryRaw);
          if (lot) addDebugLog("代替ロット番号: " + lot);
          
          // JANコードを設定
          setValue("janCode", gtin);
          
          // 有効期限の処理（存在する場合）
          if (expiryRaw && expiryRaw.length === 6) {
            const yearPrefix = parseInt(expiryRaw.substring(0, 2)) >= 50 ? "19" : "20";
            const formattedExpiry = `${yearPrefix}${expiryRaw.substring(0, 2)}-${expiryRaw.substring(
              2,
              4
            )}-${expiryRaw.substring(4, 6)}`;
            setValue("expirationDate", formattedExpiry);
          }
          
          // ロット番号の処理（存在する場合）
          if (lot) {
            setValue("lotNo", lot);
          }
          
          // 商品マスタから検索
          const product = products.find((p) => p.code === gtin);
          if (product) {
            setValue("reagentName", product.name);
            setValue("specification", product.specification || "規格未設定");
            setValue("unit", product.unit || "");
            addDebugLog("GTIN/JANコード一致（代替）: " + product.name);
            addDebugLog("規格: " + (product.specification || "規格未設定"));
            addDebugLog("単位: " + (product.unit || "未設定"));
            setBarcodeDetected(true);
            return true;
          } else {
            addDebugLog("GTIN/JANコード不一致（代替）: " + gtin);
          }
        } else {
          addDebugLog("どのパターンにも一致しませんでした");
        }
      }
      
      return false;
    },
    [products, setValue, addDebugLog]
  );

  // バーコード検出ハンドラ
  const handleBarcodeDetected = useCallback(
    (barcodeData: string) => {
      addDebugLog("バーコード検出: " + barcodeData);
      const success = parseGS1Barcode(barcodeData);
      if (success) {
        addDebugLog("バーコード処理成功");
      } else {
        addDebugLog("バーコード処理失敗、手動入力必要");
      }
    },
    [parseGS1Barcode, addDebugLog]
  );

  // バーコードスキャンエラー処理
  const handleScanError = (errorMessage: string) => {
    addDebugLog(`スキャンエラー: ${errorMessage}`);
    setError(errorMessage);
  };

  // JANコードフィールドのフォーカスが外れたときの処理
  const handleJanCodeBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const janCode = e.target.value.trim();
    if (!janCode) return;
    
    addDebugLog("JANコード手動入力: " + janCode);
    
    // 商品マスタから検索
    const product = products.find((p) => p.code === janCode);
    if (product) {
      setValue("reagentName", product.name);
      setValue("specification", product.specification || "規格未設定");
      setValue("unit", product.unit || "");
      addDebugLog("JANコード一致（手動入力）: " + product.name);
      addDebugLog("規格: " + (product.specification || "規格未設定"));
      addDebugLog("単位: " + (product.unit || "未設定"));
    } else {
      addDebugLog("JANコード不一致（手動入力）: " + janCode);
    }
  };

  // 商品マスターデータの取得
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        addDebugLog("商品マスターCSV取得開始");
        const response = await fetch('/products.csv');
        
        if (!response.ok) {
          addDebugLog(`商品マスターCSV取得エラー: ${response.status} ${response.statusText}`);
          return;
        }
        
        const csvText = await response.text();
        addDebugLog(`商品マスターCSV取得成功: ${csvText.length}バイト`);
        
        Papa.parse(csvText, {
          header: true,
          complete: (results) => {
            addDebugLog(`商品マスターCSVパース完了: ${results.data.length}件`);
            
            const parsedProducts = results.data
              .filter((item: any) => item.code && item.name)
              .map((item: any) => ({
                code: item.code,
                name: item.name,
                specification: item.specification || "",
                unit: item.unit || "",
              }));
            
            setProducts(parsedProducts);
            addDebugLog(`商品マスター設定完了: ${parsedProducts.length}件`);
          },
          error: (error: Error) => {
            console.error("CSV parse error:", error);
            addDebugLog(`CSVパースエラー: ${error.message}`);
          },
        });
      } catch (error: unknown) {
        console.error("Error fetching products CSV:", error);
        addDebugLog(`商品マスター取得エラー: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    
    fetchProducts();
  }, [addDebugLog]);

  // 部署データの取得
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        addDebugLog("部署データ取得開始");
        const { data, error } = await supabase.from("departments").select("*");
        
        if (error) {
          addDebugLog(`部署データ取得エラー: ${error.message}`);
          return;
        }
        
        if (data) {
          setDepartments(data.map(d => ({ id: d.id, name: d.name })));
          addDebugLog(`部署データ取得成功: ${data.length}件`);
        }
      } catch (error) {
        addDebugLog(`部署データ取得中の例外: ${error}`);
      }
    };
    
    fetchDepartments();
  }, [addDebugLog]);

  // フォーム送信ハンドラ
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addDebugLog("フォーム送信");
    
    // 必須項目のバリデーション
    const formValues = getValues();
    const missingFields = [];
    
    if (!formValues.department) missingFields.push("部署");
    if (!formValues.reagentName) missingFields.push("試薬名");
    if (!formValues.lotNo) missingFields.push("ロット番号");
    if (!formValues.expirationDate) missingFields.push("有効期限");
    
    if (missingFields.length > 0) {
      const errorMsg = `以下の必須項目を入力してください: ${missingFields.join(", ")}`;
      setError(errorMsg);
      addDebugLog(`バリデーションエラー: ${errorMsg}`);
      return;
    }
    
    // 試薬登録処理
    registerReagent(false);
  };

  // カメラ操作ボタン
  const toggleCamera = () => {
    addDebugLog(`カメラ表示切替: ${!showCamera ? "ON" : "OFF"}`);
    setShowCamera(!showCamera);
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen w-full flex flex-col bg-gradient-to-b from-[#fde3f1] to-[#e9ddfc]">
        {/* 共通ヘッダーコンポーネントを使用 */}
        <AppHeader showBackButton={true} title="Clinical reagent manager" />

        <div className="flex-grow flex flex-col items-center py-8 px-4">
          <div className="max-w-4xl w-full mx-auto">
            <div className="text-center mb-8">
              <h1
                className="text-4xl font-bold mb-4"
                style={{ color: '#8167a9' }}
              >
                試薬登録
              </h1>
              <h2
                className="text-3xl mb-4"
                style={{ color: '#8167a9' }}
              >
                『{departmentName}』
              </h2>
              <p className="text-lg" style={{ color: '#8167a9' }}>
                Barcode scan select 1D/2D for automatic data entry
              </p>
            </div>

            {/* バーコードスキャナー */}
            {showCamera && (
              <div className="mb-6">
                <BarcodeScanner 
                  onBarcodeDetected={handleBarcodeDetected}
                  onError={handleScanError}
                  onClose={() => setShowCamera(false)}
                />
              </div>
            )}
            
            {/* カメラ操作ボタン */}
            <div className="mb-6 text-center">
              <Button 
                onClick={toggleCamera}
                className="bg-[#8167a9] hover:bg-[#6a5491] text-white"
              >
                {showCamera ? "カメラを閉じる" : "バーコードをスキャン"}
              </Button>
            </div>

            {/* エラーメッセージ */}
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
                {error}
              </div>
            )}

            {/* 登録フォーム */}
            <Card className="shadow-lg border-[#8167a9]/20">
              <CardHeader className="bg-[#8167a9]/10">
                <CardTitle className="text-[#8167a9]">試薬情報入力</CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* 部署選択 - URLパラメータから自動入力 */}
                  <div className="space-y-2">
                    <Label htmlFor="department">部署 <span className="text-red-500">*</span></Label>
                    <Input
                      id="department"
                      {...register("department")}
                      readOnly={!!departmentName}
                      className={departmentName ? "bg-gray-100" : ""}
                    />
                    <input type="hidden" {...register("departmentId")} />
                  </div>

                  {/* JANコード */}
                  <div className="space-y-2">
                    <Label htmlFor="janCode">JANコード</Label>
                    <Input
                      id="janCode"
                      {...register("janCode")}
                      onBlur={handleJanCodeBlur}
                      placeholder="バーコードスキャンまたは手動入力"
                    />
                  </div>

                  {/* 試薬名 */}
                  <div className="space-y-2">
                    <Label htmlFor="reagentName">試薬名 <span className="text-red-500">*</span></Label>
                    <Input
                      id="reagentName"
                      {...register("reagentName")}
                      required
                    />
                  </div>

                  {/* 規格 */}
                  <div className="space-y-2">
                    <Label htmlFor="specification">規格</Label>
                    <Input
                      id="specification"
                      {...register("specification")}
                      placeholder="必要に応じて入力"
                    />
                  </div>

                  {/* 単位 */}
                  <div className="space-y-2">
                    <Label htmlFor="unit">単位</Label>
                    <Input
                      id="unit"
                      {...register("unit")}
                      placeholder="個、箱、キット等"
                    />
                  </div>

                  {/* ロット番号 */}
                  <div className="space-y-2">
                    <Label htmlFor="lotNo">ロット番号 <span className="text-red-500">*</span></Label>
                    <Input
                      id="lotNo"
                      {...register("lotNo")}
                      required
                    />
                  </div>

                  {/* 有効期限 */}
                  <div className="space-y-2">
                    <Label htmlFor="expirationDate">有効期限 <span className="text-red-500">*</span></Label>
                    <Input
                      id="expirationDate"
                      type="date"
                      {...register("expirationDate")}
                      required
                    />
                  </div>

                  {/* 送信ボタン */}
                  <div className="pt-4">
                    <Button 
                      type="submit" 
                      className="w-full bg-[#8167a9] hover:bg-[#6a5491] text-white" 
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "登録中..." : "登録する"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
            
            {/* デバッグログ表示 (開発環境のみ) */}
            {process.env.NODE_ENV === "development" && (
              <Card className="mt-6 shadow-lg border-[#8167a9]/20">
                <CardHeader className="bg-[#8167a9]/10">
                  <CardTitle className="text-[#8167a9]">デバッグログ</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-100 p-4 rounded h-40 overflow-y-auto">
                    {debugLogs.map((log, index) => (
                      <div key={index} className="text-xs font-mono">
                        {log}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ローディング表示用のコンポーネント
function LoadingFallback() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-b from-[#fde3f1] to-[#e9ddfc]">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4" style={{ color: '#8167a9' }}>
          読み込み中...
        </h2>
        <div className="w-16 h-16 border-4 border-[#8167a9] border-t-transparent rounded-full animate-spin mx-auto"></div>
      </div>
    </div>
  );
}

// メインコンポーネント
export default function ReagentRegistration() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ReagentRegistrationContent />
    </Suspense>
  );
} 