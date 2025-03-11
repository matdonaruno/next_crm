"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Home } from "lucide-react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import NextImage from "next/image";
// 新しいバーコードスキャナーコンポーネントをインポート
import BarcodeScanner from "@/components/BarcodeScanner";

type FormValues = {
  department: string;
  reagentName: string;
  specification: string;
  lotNo: string;
  expirationDate: string;
  // 追加: JANコード欄
  janCode?: string;
};

interface Product {
  code: string; // JAN/EAN/GTINなど
  name: string;
}

export default function ReagentRegistration() {
  useRequireAuth();
  const { register, setValue, getValues, reset, formState: { errors } } = useForm<FormValues>();
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showCamera, setShowCamera] = useState<boolean>(true); // 初期値をtrueに戻す
  
  // 部署一覧、商品CSV、バーコード読み取り状況
  const [departments, setDepartments] = useState<{id: string, name: string}[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [barcodeDetected, setBarcodeDetected] = useState<boolean>(false);
  
  // デバッグログ
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const addDebugLog = useCallback((message: string) => {
    console.log(message); // コンソールにも出力
    setDebugLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  }, []);
  
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
        
        addDebugLog("有効期限変換: " + formattedExpiry);

        // CSVから商品名をルックアップ
        const product = products.find((p) => p.code === gtin);
        if (product) {
          setValue("reagentName", product.name);
          addDebugLog("商品名ルックアップ成功: " + product.name);
        } else {
          setValue("reagentName", "商品名未設定");
          addDebugLog("商品名ルックアップ失敗: 該当するコード " + gtin + " が見つかりません");
        }
        setValue("specification", "規格未設定");
        addDebugLog("各フィールドに自動入力完了");
        setShowCamera(false);
        setBarcodeDetected(true);
        setError("");
      } else {
        // 別のGS1パターンを試す
        const alternativeGs1Regex = /01(\d{14})17(\d{6})10(.+)/;
        const alternativeMatch = cleanBarcode.match(alternativeGs1Regex);
        
        addDebugLog("代替正規表現パターン: " + alternativeGs1Regex);
        
        if (alternativeMatch) {
          const gtin = alternativeMatch[1];
          const expiryRaw = alternativeMatch[2];
          const lot = alternativeMatch[3];
          addDebugLog("代替パターン - GTIN: " + gtin);
          addDebugLog("代替パターン - 生の有効期限: " + expiryRaw);
          addDebugLog("代替パターン - ロット番号: " + lot);
          
          // YY(>=50なら1900年代、<50なら2000年代) としてパース
          const yearPrefix = parseInt(expiryRaw.substring(0, 2)) >= 50 ? "19" : "20";
          const formattedExpiry = `${yearPrefix}${expiryRaw.substring(0, 2)}-${expiryRaw.substring(
            2,
            4
          )}-${expiryRaw.substring(4, 6)}`;
          setValue("expirationDate", formattedExpiry);
          
          // ロット番号の処理
          setValue("lotNo", lot);
          
          // CSVから商品名をルックアップ
          const product = products.find((p) => p.code === gtin);
          if (product) {
            setValue("reagentName", product.name);
            addDebugLog("商品名ルックアップ成功: " + product.name);
          } else {
            setValue("reagentName", "商品名未設定");
            addDebugLog("商品名ルックアップ失敗: 該当するコード " + gtin + " が見つかりません");
          }
          setValue("specification", "規格未設定");
          addDebugLog("各フィールドに自動入力完了");
          setShowCamera(false);
          setBarcodeDetected(true);
          setError("");
          return;
        }
        
        // 単純なJANコードとして処理を試みる
        if (cleanBarcode.length >= 8 && cleanBarcode.length <= 13) {
          addDebugLog("GS1ではなくJANコードとして処理を試みます: " + cleanBarcode);
          const product = products.find((p) => p.code === cleanBarcode);
          if (product) {
            setValue("reagentName", product.name);
            setValue("specification", "規格未設定");
            setValue("janCode", cleanBarcode);
            addDebugLog("JANコード一致: " + product.name);
            setShowCamera(false);
            setBarcodeDetected(true);
            setError("");
            return;
          }
        }
        
        // 手動解析を試みる
        if (cleanBarcode.includes("01") && cleanBarcode.includes("17") && cleanBarcode.includes("10")) {
          addDebugLog("手動解析を試みます: " + cleanBarcode);
          
          // 01から始まる14桁の数字を抽出
          const gtinMatch = cleanBarcode.match(/01(\d{14})/);
          const gtin = gtinMatch ? gtinMatch[1] : null;
          
          // 17から始まる6桁の数字を抽出
          const expiryMatch = cleanBarcode.match(/17(\d{6})/);
          const expiryRaw = expiryMatch ? expiryMatch[1] : null;
          
          // 10から始まる英数字を抽出
          const lotMatch = cleanBarcode.match(/10([A-Za-z0-9]+)/);
          const lot = lotMatch ? lotMatch[1] : null;
          
          addDebugLog("手動解析 - GTIN: " + (gtin || "なし"));
          addDebugLog("手動解析 - 生の有効期限: " + (expiryRaw || "なし"));
          addDebugLog("手動解析 - ロット番号: " + (lot || "なし"));
          
          if (gtin && expiryRaw && lot) {
            // YY(>=50なら1900年代、<50なら2000年代) としてパース
            const yearPrefix = parseInt(expiryRaw.substring(0, 2)) >= 50 ? "19" : "20";
            const formattedExpiry = `${yearPrefix}${expiryRaw.substring(0, 2)}-${expiryRaw.substring(
              2,
              4
            )}-${expiryRaw.substring(4, 6)}`;
            setValue("expirationDate", formattedExpiry);
            
            // ロット番号の処理
            setValue("lotNo", lot);
            
            // CSVから商品名をルックアップ
            const product = products.find((p) => p.code === gtin);
            if (product) {
              setValue("reagentName", product.name);
              addDebugLog("商品名ルックアップ成功: " + product.name);
            } else {
              setValue("reagentName", "商品名未設定");
              addDebugLog("商品名ルックアップ失敗: 該当するコード " + gtin + " が見つかりません");
            }
            setValue("specification", "規格未設定");
            addDebugLog("各フィールドに自動入力完了");
            setShowCamera(false);
            setBarcodeDetected(true);
            setError("");
            return;
          }
        }
        
        addDebugLog("正規表現マッチ失敗。GS1ではない可能性: " + cleanBarcode);
        setError("GS1バーコードの正規表現にマッチしませんでした");
      }
    },
    [addDebugLog, products, setValue]
  );

  // 部署一覧取得（supabaseから）
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        // ユーザーの施設IDを取得
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          console.error("ユーザー情報の取得に失敗しました");
          return;
        }
        
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("facility_id")
          .eq("id", userData.user.id)
          .single();
          
        if (profileError || !profileData?.facility_id) {
          console.error("施設情報の取得に失敗しました");
          return;
        }
        
        // 施設IDに基づいて部署を取得
        const { data, error } = await supabase
          .from("departments")
          .select("id, name")
          .eq("facility_id", profileData.facility_id)
          .order("name");
          
        if (error) {
          console.error("Error fetching departments:", error);
        } else {
          setDepartments(data || []);
        }
      } catch (err) {
        console.error("Error in fetchDepartments:", err);
      }
    };
    fetchDepartments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 商品CSV（マスタ）の読み込み
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch("/products.csv");
        const csvText = await response.text();
        
        // CSVをパースする前に、codeフィールドの先頭に0を追加する処理
        const lines = csvText.split('\n');
        const header = lines[0]; // ヘッダー行を保存
        
        /**
         * ダミーJANコード採番手法
         * -----------------------------------------------
         * 1. プレフィックス: 0999
         *    - 実在しないJANコードの接頭辞として使用
         *    - このプレフィックスで始まるコードは架空のJANコードであることを示す
         * 
         * 2. シーケンス番号: 10桁の連番
         *    - 1000000から始まる連番を使用
         *    - 各商品に一意のコードを割り当てるため
         * 
         * 3. チェックディジット: 1桁
         *    - 実際のJANコードと同様の計算方法でチェックディジットを算出
         *    - 奇数桁の数字をそのまま、偶数桁の数字を3倍して合計し、
         *      その合計を10で割った余りを10から引いた値（10の場合は0）
         * 
         * 例: 0999 + 1000001 + チェックディジット = 09991000001X
         * 
         * 注意: このコードは実在するJANコードと衝突しないように設計されています
         */
        // 架空のJANコードのプレフィックス（実在しないJANコードの接頭辞）
        // 0999で始まるコードは架空のJANコードであることを示す
        const fakeJanPrefix = "0999"; // 実在しないJANコードのプレフィックス
        let fakeJanCounter = 1000000; // カウンター（ユニークなコードを生成するため）
        
        // ヘッダー以外の各行を処理
        const modifiedLines = lines.slice(1).map(line => {
          if (!line.trim()) return line; // 空行はスキップ
          
          const columns = line.split(',');
          
          // codeが空の場合、架空のJANコードを生成
          if (!columns[0] || columns[0].trim() === '') {
            // 架空のJANコードを生成（14桁）
            // 0999 + 10桁のシーケンス番号
            const fakeJanBase = fakeJanPrefix + String(fakeJanCounter++).padStart(10, '0');
            
            // チェックディジットを計算（実際のJANコードの計算方法に準拠）
            let sum = 0;
            for (let i = 0; i < 13; i++) {
              const digit = parseInt(fakeJanBase[i]);
              sum += i % 2 === 0 ? digit : digit * 3;
            }
            const checkDigit = (10 - (sum % 10)) % 10;
            
            // 架空のJANコードを設定（プレフィックス + カウンター + チェックディジット）
            columns[0] = fakeJanBase.slice(0, 13) + checkDigit;
            addDebugLog(`空のcodeに架空のJANコード(0999で始まる)を生成: ${columns[0]}`);
          }
          // codeが13桁の場合、先頭に0を追加
          else if (columns[0] && columns[0].length === 13) {
            columns[0] = '0' + columns[0];
          }
          
          return columns.join(',');
        });
        
        // ヘッダーと修正した行を結合
        const modifiedCsvText = [header, ...modifiedLines].join('\n');
        
        // 修正したCSVをパース
        const parsed = Papa.parse(modifiedCsvText, { header: true });
        setProducts(parsed.data as Product[]);
        addDebugLog("商品CSV読み込み成功 - codeフィールドを14桁に変換、空のcodeに架空のJANコード(0999で始まる)を生成");
      } catch (error) {
        console.error("CSV読み込みエラー", error);
        addDebugLog("CSV読み込みエラー");
      }
    };
    fetchProducts();
  }, []);

  // バーコードスキャン開始
  const handleBarcodeScan = () => {
    addDebugLog("バーコードスキャン開始");
    setShowCamera(true);
  };

  // バーコードスキャン結果処理
  const handleBarcodeDetected = (barcode: string, format: string) => {
    addDebugLog(`バーコード検出: ${barcode} (${format})`);
    parseGS1Barcode(barcode);
  };

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
      addDebugLog("JANコード一致（手動入力）: " + product.name);
    } else {
      addDebugLog("JANコード不一致（手動入力）: " + janCode);
    }
  };

  // 次へボタン
  const handleNext = () => {
    const formValues = getValues();
    if (!formValues.department || !formValues.reagentName || !formValues.lotNo || !formValues.expirationDate) {
      setError("必須項目を入力してください");
      return;
    }
    
    // 試薬登録処理へ
    registerReagent(false);
  };

  // 試薬名フィールドのフォーカスが外れたときの処理
  const handleReagentNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // 必要に応じて実装
  };

  // 試薬登録処理
  const registerReagent = async (startUsage: boolean) => {
    try {
      setIsSubmitting(true);
      setError("");
      
      const formValues = getValues();
      
      // ユーザー情報取得
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setError("ユーザー情報の取得に失敗しました");
        return;
      }
      
      // 試薬データ作成
      const reagentData = {
        department: formValues.department,
        name: formValues.reagentName,
        specification: formValues.specification || "",
        lotNo: formValues.lotNo,
        expirationDate: formValues.expirationDate,
        registrationDate: new Date().toISOString(),
        registeredBy: userData.user.id,
        used: startUsage,
        used_at: startUsage ? new Date().toISOString() : null,
        used_by: startUsage ? userData.user.id : null,
      };
      
      // Supabaseに登録
      const { data, error } = await supabase
        .from("reagent_packages")
        .insert(reagentData)
        .select();
        
      if (error) {
        console.error("Error inserting reagent:", error);
        setError("試薬の登録に失敗しました: " + error.message);
        return;
      }
      
      addDebugLog("試薬登録成功: ID=" + data[0].id);
      
      // 使用開始の場合は使用履歴も登録
      if (startUsage && data && data[0]) {
        const usageData = {
          reagent_package_id: data[0].id,
          usagestartdate: new Date().toISOString(),
          user: userData.user.id,
        };
        
        const { error: usageError } = await supabase
          .from("reagent_items")
          .insert(usageData);
          
        if (usageError) {
          console.error("Error inserting usage:", usageError);
          setError("使用履歴の登録に失敗しました: " + usageError.message);
          return;
        }
        
        addDebugLog("使用履歴登録成功");
      }
      
      // 登録成功後、ダッシュボードに戻る
      router.push("/reagent_dash");
    } catch (err) {
      console.error("Error in registerReagent:", err);
      setError("予期せぬエラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ページ初期表示時にカメラON
  useEffect(() => {
    addDebugLog("ページロード完了。カメラを自動起動します。");
    setShowCamera(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">試薬登録</h1>
        <Button variant="outline" onClick={() => router.push("/reagent_dash")}>
          <Home className="mr-2 h-4 w-4" />
          ダッシュボードに戻る
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>試薬情報入力</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="department">部署 *</Label>
              <select
                id="department"
                className="w-full p-2 border rounded"
                {...register("department", { required: true })}
              >
                <option value="">選択してください</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
              {errors.department && (
                <p className="text-red-500 text-sm mt-1">部署を選択してください</p>
              )}
            </div>

            <div>
              <Label htmlFor="janCode">JANコード</Label>
              <Input
                id="janCode"
                type="text"
                placeholder="JANコード"
                {...register("janCode")}
                onBlur={handleJanCodeBlur}
              />
            </div>

            <div>
              <Label htmlFor="reagentName">試薬名 *</Label>
              <Input
                id="reagentName"
                type="text"
                placeholder="試薬名"
                {...register("reagentName", { required: true })}
                onBlur={handleReagentNameBlur}
              />
              {errors.reagentName && (
                <p className="text-red-500 text-sm mt-1">試薬名を入力してください</p>
              )}
            </div>

            <div>
              <Label htmlFor="specification">規格</Label>
              <Input
                id="specification"
                type="text"
                placeholder="規格"
                {...register("specification")}
              />
            </div>

            <div>
              <Label htmlFor="lotNo">ロット番号 *</Label>
              <Input
                id="lotNo"
                type="text"
                placeholder="ロット番号"
                {...register("lotNo", { required: true })}
              />
              {errors.lotNo && (
                <p className="text-red-500 text-sm mt-1">ロット番号を入力してください</p>
              )}
            </div>

            <div>
              <Label htmlFor="expirationDate">有効期限 *</Label>
              <Input
                id="expirationDate"
                type="date"
                {...register("expirationDate", { required: true })}
              />
              {errors.expirationDate && (
                <p className="text-red-500 text-sm mt-1">有効期限を入力してください</p>
              )}
            </div>

            {error && <p className="text-red-500">{error}</p>}

            <div className="flex justify-center">
              <Button
                type="button"
                onClick={handleBarcodeScan}
                className="w-full md:w-auto"
              >
                バーコードスキャン
              </Button>
            </div>

            {showCamera && (
              <div className="mt-4">
                <BarcodeScanner 
                  onBarcodeDetected={handleBarcodeDetected}
                  onError={handleScanError}
                  onClose={() => setShowCamera(false)}
                />
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => router.push("/reagent_dash")}
            disabled={isSubmitting}
          >
            キャンセル
          </Button>
          <div className="space-x-2">
            <Button
              onClick={handleNext}
              disabled={isSubmitting}
            >
              {isSubmitting ? "登録中..." : "登録"}
            </Button>
            <Button
              onClick={() => registerReagent(true)}
              disabled={isSubmitting}
            >
              {isSubmitting ? "登録中..." : "登録して使用開始"}
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* デバッグログ表示（開発時のみ表示） */}
      {process.env.NODE_ENV === "development" && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>デバッグログ</CardTitle>
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
  );
}