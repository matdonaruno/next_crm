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
import { useToast } from "@/hooks/use-toast";
import BarcodeScanner from "@/components/BarcodeScanner";
import { AppHeader } from "@/components/ui/app-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";

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
  // 認証チェックの代わりに直接認証状態を取得
  const { user, profile, loading } = useAuth();
  
  const { register, setValue, getValues, reset, formState: { /* errors */ } } = useForm<FormValues>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const departmentName = searchParams?.get('department') || '';
  const departmentId = searchParams?.get('departmentId') || '';
  
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showCamera, setShowCamera] = useState<boolean>(true);
  const [currentUserName, setCurrentUserName] = useState("");
  const [facilityName, setFacilityName] = useState("");
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

  // 認証チェック
  useEffect(() => {
    // ロード中は何もしない
    if (loading) return;

    // 認証されていない場合はログインページにリダイレクト
    if (!user) {
      router.push("/login");
      return;
    }

    // フルネームが設定されていない場合はユーザー設定ページにリダイレクト
    if (!profile?.fullname) {
      router.push("/user-settings");
      return;
    }

    // 施設IDが設定されていない場合はユーザー設定ページにリダイレクト
    if (!profile?.facility_id) {
      router.push("/user-settings");
      return;
    }
  }, [user, profile, loading, router]);

  // URLパラメータから部署情報を設定
  useEffect(() => {
    if (departmentName && departmentId) {
      addDebugLog(`URLパラメータから部署情報を設定: ${departmentName} (ID: ${departmentId})`);
      setValue("department", departmentName);
      setValue("departmentId", departmentId);
    }
  }, [departmentName, departmentId, setValue, addDebugLog]);

  // ユーザー情報と施設情報の取得
  const fetchUserAndFacilityInfo = useCallback(async () => {
    try {
      // プロファイル情報からユーザー名を取得
      if (profile?.fullname) {
        setCurrentUserName(profile.fullname);
      }
      
      // 施設情報を取得
      if (profile?.facility_id) {
        const { data: facilityData, error: facilityError } = await supabase
          .from("facilities")
          .select("name")
          .eq("id", profile.facility_id)
          .single();
          
        if (!facilityError && facilityData) {
          setFacilityName(facilityData.name);
        }
      }
    } catch (error) {
      addDebugLog("ユーザーおよび施設情報取得エラー: " + JSON.stringify(error));
    }
  }, [profile, addDebugLog]);

  // コンポーネントマウント時にユーザー情報と施設情報を取得
  useEffect(() => {
    if (!loading && user && profile) {
      fetchUserAndFacilityInfo();
    }
  }, [loading, user, profile, fetchUserAndFacilityInfo]);

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
      // 元のバーコードデータをログ
      addDebugLog("元のバーコードデータ: " + originalBarcode);
      
      // バーコードの前処理（スペースは残すが他の不要文字を削除）
      const preprocessedBarcode = originalBarcode.replace(/[☒]/g, " ");
      addDebugLog("前処理済みバーコード: " + preprocessedBarcode);
      
      // 正規表現に入れる前にApplication Identifiersを検出しやすい形式に変換
      let structuredBarcode = preprocessedBarcode;
      
      // 括弧で囲まれたAIがある場合（例: (01)04015630929276）、その形式をそのまま使用
      const hasParenthesis = /\(\d{2,3}\)/.test(preprocessedBarcode);
      
      if (!hasParenthesis) {
        // 括弧がない場合は、既知のAIパターンを探して括弧で囲む処理を追加
        // 典型的なAIの追加
        structuredBarcode = structuredBarcode
          .replace(/(?<!\d)01(?=\d{14})/, "(01)")
          .replace(/(?<!\d)10(?=[\w\d-]+)/, "(10)")
          .replace(/(?<!\d)11(?=\d{6})/, "(11)")
          .replace(/(?<!\d)17(?=\d{6})/, "(17)")
          .replace(/(?<!\d)240(?=[\w\d-]+)/, "(240)");
      }
      
      addDebugLog("構造化バーコード: " + structuredBarcode);
      
      // 抽出したデータ
      let gtin = null;
      let lot = null;
      let expiry = null;
      
      // === 1. 括弧付きAIフォーマットの抽出（最も信頼性が高い） ===
      const aiGtin = structuredBarcode.match(/\(01\)([\d]{14})/);
      const aiLot = structuredBarcode.match(/\(10\)([\w\d\s-]+?)(?=\(|$)/);
      const aiExpiry1 = structuredBarcode.match(/\(17\)([\d]{6})/);
      const aiExpiry2 = structuredBarcode.match(/\(11\)([\d]{6})/);
      
      if (aiGtin) {
        gtin = aiGtin[1];
        addDebugLog("AI(01)からGTIN抽出: " + gtin);
      }
      
      if (aiLot) {
        lot = aiLot[1].trim();
        addDebugLog("AI(10)からロット番号抽出: " + lot);
      }
      
      if (aiExpiry1) {
        expiry = aiExpiry1[1];
        addDebugLog("AI(17)から有効期限抽出: " + expiry);
      } else if (aiExpiry2) {
        expiry = aiExpiry2[1];
        addDebugLog("AI(11)から製造日抽出: " + expiry);
      }
      
      // === 2. 括弧なしのGS1-128形式のパターン抽出 ===
      if (!gtin && !lot && !expiry) {
        // 括弧なしのGS1-128形式（例: 01049123451234520510ABCD1234）
        const gs1Regex = /01(\d{14}).*?(?:17|11)(\d{6}).*?10([A-Za-z0-9\s-]+)/;
        const match = preprocessedBarcode.replace(/\s/g, "").match(gs1Regex);
        
        if (match) {
          gtin = match[1];
          expiry = match[2];
          lot = match[3];
          addDebugLog("GS1-128形式からのGTIN: " + gtin);
          addDebugLog("GS1-128形式からの有効期限: " + expiry);
          addDebugLog("GS1-128形式からのロット: " + lot);
        }
      }
      
      // === 3. QRコード特有の形式の抽出 ===
      if (!gtin) {
        // QRコード特有の形式（例: 9114175095 102995266 17270800）
        // スペースで区切られたフォーマットの処理
        const qrParts = preprocessedBarcode.split(/\s+/);
        
        // 先頭の91などのプレフィックスを無視して14桁または13桁のGTINを探す
        for (const part of qrParts) {
          if (part.length >= 8) {
            const possibleGtin = part.replace(/^91/, ""); // 91プレフィックスを除去
            if (/^\d{8,14}$/.test(possibleGtin)) {
              gtin = possibleGtin.padStart(14, '0'); // 14桁に正規化
              addDebugLog("QRコード形式から可能性のあるGTIN: " + gtin);
              break;
            }
          }
        }
        
        // ロット番号の抽出
        // 10から始まる部分をロット番号として処理
        const lotPart = qrParts.find(part => part.startsWith("10"));
        if (lotPart) {
          lot = lotPart.substring(2); // "10"を削除
          addDebugLog("QRコード形式からロット番号: " + lot);
        }
        
        // 有効期限の抽出
        // 17から始まる部分を有効期限として処理
        const expiryPart = qrParts.find(part => part.startsWith("17"));
        if (expiryPart) {
          expiry = expiryPart.substring(2); // "17"を削除
          addDebugLog("QRコード形式から有効期限: " + expiry);
        }
      }
      
      // === 4. 最終的なフォールバック処理 ===
      if (!gtin || !lot) {
        // それでも抽出できない場合は、数字の連続を探す
        const allNumbers = preprocessedBarcode.match(/\d+/g) || [];
        const allWords = preprocessedBarcode.match(/[A-Za-z0-9-]+/g) || [];
        
        // GTINとして可能性のある14桁または13桁の数字を探す
        if (!gtin) {
          for (const num of allNumbers) {
            if (num.length >= 13 && num.length <= 14) {
              gtin = num.padStart(14, '0');
              addDebugLog("フォールバック: 可能性のあるGTIN: " + gtin);
              break;
            }
          }
        }
        
        // ロット番号として可能性のある英数字を探す
        if (!lot && allWords.length > 0) {
          // 数字だけではないパターンを優先
          const nonNumericWords = allWords.filter(word => /[A-Za-z-]/.test(word));
          if (nonNumericWords.length > 0) {
            lot = nonNumericWords[0];
          } else {
            // 短い数字の連続をロット番号と見なす (長すぎるものはGTINの可能性)
            const shortNumbers = allNumbers.filter(num => num.length > 2 && num.length < 10);
            if (shortNumbers.length > 0) {
              lot = shortNumbers[0];
            }
          }
          addDebugLog("フォールバック: 可能性のあるロット番号: " + lot);
        }
      }
      
      // === 5. 抽出したデータを検証して設定 ===
      let success = false;
      
      // GTINの処理
      if (gtin && gtin.length >= 8) {
        setValue("janCode", gtin);
        addDebugLog("JANコードを設定: " + gtin);
        
        // 商品マスタから検索
        const product = products.find(p => p.code === gtin);
        if (product) {
          setValue("reagentName", product.name);
          setValue("specification", product.specification || "規格未設定");
          setValue("unit", product.unit || "");
          addDebugLog("商品マスタから情報取得: " + product.name);
          success = true;
        }
      }
      
      // ロット番号の処理
      if (lot) {
        setValue("lotNo", lot);
        addDebugLog("ロット番号を設定: " + lot);
        success = true;
      }
      
      // 有効期限の処理
      if (expiry) {
        try {
          // 日付のフォーマットを処理
          let formattedExpiry = "";
          
          if (expiry.length === 6) {
            // YYMMDD形式
            const yy = expiry.substring(0, 2);
            const mm = expiry.substring(2, 4);
            const dd = expiry.substring(4, 6);
            
            // 年の補完（2000年代か1900年代か）
            const yearPrefix = parseInt(yy) >= 50 ? "19" : "20";
            formattedExpiry = `${yearPrefix}${yy}-${mm}-${dd}`;
          } else if (expiry.length === 4) {
            // YYMM形式（日は最終日を設定）
            const yy = expiry.substring(0, 2);
            const mm = expiry.substring(2, 4);
            
            // 年の補完
            const yearPrefix = parseInt(yy) >= 50 ? "19" : "20";
            // 月の最終日を取得（簡易的に30日または31日を設定）
            const lastDay = [4, 6, 9, 11].includes(parseInt(mm)) ? "30" : 
                           (parseInt(mm) === 2 ? "28" : "31");
            
            formattedExpiry = `${yearPrefix}${yy}-${mm}-${lastDay}`;
          } else if (expiry.length === 8) {
            // YYYYMMDD形式
            const yyyy = expiry.substring(0, 4);
            const mm = expiry.substring(4, 6);
            const dd = expiry.substring(6, 8);
            
            formattedExpiry = `${yyyy}-${mm}-${dd}`;
          }
          
          if (formattedExpiry) {
            setValue("expirationDate", formattedExpiry);
            addDebugLog("有効期限を設定: " + formattedExpiry);
            success = true;
          }
        } catch (e) {
          addDebugLog("有効期限のパースに失敗: " + e);
        }
      }
      
      // 検出結果を設定
      setBarcodeDetected(success);
      return success;
    },
    [products, setValue, addDebugLog]
  );

  // 1次元バーコード専用のパース処理（GS1-128、EANなど）
  const parseLinearBarcode = useCallback(
    (originalBarcode: string) => {
      addDebugLog("1次元バーコードのパース処理を実行: " + originalBarcode);
      
      // バーコードの前処理（スペースや特殊文字を削除）
      const cleanBarcode = originalBarcode.replace(/[\s\-]/g, "");
      
      // GS1-128形式のバーコードをパース
      // 例: 01049123451234520510ABCD1234
      // 01: GTIN (14桁)
      // 17: 有効期限 (YYMMDD)
      // 10: ロット番号 (可変長)
      
      // より柔軟な正規表現パターン
      const gs1Regex = /01(\d{14}).*?17(\d{6}).*?10([A-Za-z0-9]+)/;
      const match = cleanBarcode.match(gs1Regex);
      
      addDebugLog("1次元バーコード正規表現パターン: " + gs1Regex);
      
      if (match) {
        const gtin = match[1];
        const expiryRaw = match[2];
        const lot = match[3];
        
        addDebugLog("1次元バーコードからのGTIN: " + gtin);
        addDebugLog("1次元バーコードからの生の有効期限: " + expiryRaw);
        addDebugLog("1次元バーコードからのロット番号: " + lot);
        
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
      }
      
      // 1次元バーコードの代替パターン
      const fallbackRegex = /(01)?(\d{14})(17)?(\d{6})?(10)?([A-Za-z0-9]+)?/;
      const fallbackMatch = cleanBarcode.match(fallbackRegex);
      
      if (fallbackMatch) {
        addDebugLog("1次元バーコード代替パターンでマッチ: " + JSON.stringify(fallbackMatch));
        const gtin = fallbackMatch[2];
        const expiryRaw = fallbackMatch[4];
        const lot = fallbackMatch[6];
        
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
      
      // どのパターンにも一致しなかった場合は、汎用パーサーを試す
      return parseGS1Barcode(originalBarcode);
    },
    [parseGS1Barcode, products, setValue, addDebugLog]
  );

  // 2次元バーコード専用のパース処理（QRコード、データマトリックスなど）
  const parseQRCode = useCallback(
    (originalBarcode: string) => {
      addDebugLog("2次元バーコードのパース処理を実行: " + originalBarcode);
      
      // QRコード特有の形式（例: 9114175095 102995266 17270800）
      // スペースで区切られたフォーマットの処理
      const qrParts = originalBarcode.split(/\s+/);
      let gtin = null;
      let lot = null;
      let expiry = null;
      let success = false;
      
      // 先頭の91などのプレフィックスを無視して14桁または13桁のGTINを探す
      for (const part of qrParts) {
        if (part.length >= 8) {
          const possibleGtin = part.replace(/^91/, ""); // 91プレフィックスを除去
          if (/^\d{8,14}$/.test(possibleGtin)) {
            gtin = possibleGtin.padStart(14, '0'); // 14桁に正規化
            addDebugLog("QRコード形式から可能性のあるGTIN: " + gtin);
            
            // GTINが見つかれば設定
            if (gtin) {
              setValue("janCode", gtin);
              
              // 商品マスタから検索
              const product = products.find(p => p.code === gtin);
              if (product) {
                setValue("reagentName", product.name);
                setValue("specification", product.specification || "規格未設定");
                setValue("unit", product.unit || "");
                addDebugLog("QRコードからの商品情報取得: " + product.name);
                success = true;
              }
            }
            break;
          }
        }
      }
      
      // ロット番号の抽出
      // 10から始まる部分をロット番号として処理
      const lotPart = qrParts.find(part => part.startsWith("10"));
      if (lotPart) {
        lot = lotPart.substring(2); // "10"を削除
        addDebugLog("QRコード形式からロット番号: " + lot);
        setValue("lotNo", lot);
        success = true;
      }
      
      // 有効期限の抽出
      // 17から始まる部分を有効期限として処理
      const expiryPart = qrParts.find(part => part.startsWith("17"));
      if (expiryPart) {
        expiry = expiryPart.substring(2); // "17"を削除
        addDebugLog("QRコード形式から有効期限: " + expiry);
        
        // 日付のフォーマットを処理
        if (expiry && expiry.length === 6) {
          // YYMMDD形式
          const yy = expiry.substring(0, 2);
          const mm = expiry.substring(2, 4);
          const dd = expiry.substring(4, 6);
          
          // 年の補完（2000年代か1900年代か）
          const yearPrefix = parseInt(yy) >= 50 ? "19" : "20";
          const formattedExpiry = `${yearPrefix}${yy}-${mm}-${dd}`;
          setValue("expirationDate", formattedExpiry);
          success = true;
        }
      }
      
      // QRコードの代替パターン（コロン区切り）
      if (!success && originalBarcode.includes(':')) {
        const colonParts = originalBarcode.split(':');
        // コロン区切りのQRコードでは、キーと値のペアが期待される
        for (let i = 0; i < colonParts.length - 1; i++) {
          const key = colonParts[i].trim();
          const value = colonParts[i + 1].trim();
          
          if (key.endsWith("01") && /^\d{8,14}$/.test(value)) {
            setValue("janCode", value.padStart(14, '0'));
            success = true;
          } else if (key.endsWith("10")) {
            setValue("lotNo", value);
            success = true;
          } else if (key.endsWith("17") && value.length === 6) {
            // YYMMDD形式
            const yy = value.substring(0, 2);
            const mm = value.substring(2, 4);
            const dd = value.substring(4, 6);
            
            // 年の補完（2000年代か1900年代か）
            const yearPrefix = parseInt(yy) >= 50 ? "19" : "20";
            const formattedExpiry = `${yearPrefix}${yy}-${mm}-${dd}`;
            setValue("expirationDate", formattedExpiry);
            success = true;
          }
        }
      }
      
      // 検出結果を設定
      setBarcodeDetected(success);
      
      // 成功したか、パースできなかった場合は汎用パーサーを試す
      if (success) {
        return true;
      } else {
        return parseGS1Barcode(originalBarcode);
      }
    },
    [parseGS1Barcode, products, setValue, addDebugLog]
  );

  // バーコード検出ハンドラ
  const handleBarcodeDetected = useCallback(
    (barcodeData: string, format: string) => {
      addDebugLog(`バーコード検出: ${barcodeData} (フォーマット: ${format})`);
      
      // バーコードフォーマットに基づいて適切なパーサーを選択
      let success = false;
      
      // 2Dバーコード（QRコード、データマトリックスなど）
      if (format === 'qr_code' || format === 'data_matrix' || format === 'pdf417') {
        success = parseQRCode(barcodeData);
      } 
      // 1Dバーコード（GS1-128、EANなど）
      else if (format === 'code_128' || format === 'ean_13' || format === 'ean_8' || format === 'upc_a' || format === 'upc_e') {
        success = parseLinearBarcode(barcodeData);
      } 
      // フォーマットが不明またはフォールバック（以前の方法を使用）
      else {
        success = parseGS1Barcode(barcodeData);
      }
      
      if (success) {
        addDebugLog("バーコード処理成功");
      } else {
        addDebugLog("バーコード処理失敗、手動入力必要");
      }
    },
    [parseGS1Barcode, parseLinearBarcode, parseQRCode, addDebugLog]
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
              
              {/* ユーザー情報表示 - 中央揃え */}
              <div className="mt-2 text-center">
                {facilityName && (
                  <p className="text-sm text-gray-600">
                    施設「{facilityName}」
                  </p>
                )}
                {currentUserName && (
                  <p className="text-sm text-gray-600">
                    {currentUserName}さんがログインしています！
                  </p>
                )}
              </div>
            </div>

            {/* ローディング中の表示 */}
            {loading ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 border-4 border-[#8167a9] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-[#8167a9]">認証情報を確認中...</p>
              </div>
            ) : (
              <>
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
              </>
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