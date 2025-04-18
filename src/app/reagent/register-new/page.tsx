"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useForm } from "react-hook-form";
import supabase from "@/lib/supabaseClient";
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
import { getJstTimestamp } from "@/lib/utils";

type FormValues = {
  department: string;
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
  const { user, profile, loading } = useAuth();
  
  const { register, setValue, getValues, reset, formState: { /* errors */ } } = useForm<FormValues>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const departmentName = searchParams?.get('department') || '';
  const departmentId = searchParams?.get('departmentId') || '';
  
  const [showCamera, setShowCamera] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [barcodeDetected, setBarcodeDetected] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [departments, setDepartments] = useState<{ id: string; name: string; }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const { toast } = useToast(); // トースト通知を使用
  
  const [currentUserName, setCurrentUserName] = useState("");
  const [facilityName, setFacilityName] = useState("");
  
  // デバッグログ
  const addDebugLog = useCallback((message: string) => {
    console.log(message); // コンソールにも出力
    setDebugLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  }, []);

  // 認証チェック
  useEffect(() => {
    // ロード中は何もしない
    if (loading) {
      addDebugLog("認証情報ロード中...");
      return;
    }

    // 認証されていない場合はログインページにリダイレクト
    if (!user) {
      addDebugLog("認証エラー: ユーザー情報がありません");
      router.push("/login");
      return;
    }

    addDebugLog(`認証成功: ユーザーID ${user.id}`);
    
    // プロファイル情報をチェック
    addDebugLog(`プロファイル情報: ${JSON.stringify({
      exists: !!profile,
      fullname: profile?.fullname || "未設定",
      facility_id: profile?.facility_id || "未設定"
    })}`);

    // プロファイル自体が存在しない場合は続行（リダイレクトしない）
    if (!profile) {
      addDebugLog("警告: プロファイル情報がありませんが、処理を続行します");
      return;
    }

    // フルネームや施設IDが設定されていなくても処理を続行
    if (!profile.fullname) {
      addDebugLog("警告: フルネームが設定されていませんが、処理を続行します");
    }

    if (!profile.facility_id) {
      addDebugLog("警告: 施設IDが設定されていませんが、処理を続行します");
    }

    addDebugLog("認証・プロファイルチェック完了: 問題なし");
  }, [user, profile, loading, router, addDebugLog]);

  // URLパラメータから部署情報を設定
  useEffect(() => {
    if (departmentName) {
      addDebugLog(`URLパラメータから部署情報を設定: ${departmentName}`);
      setValue("department", departmentName);
    }
  }, [departmentName, setValue, addDebugLog]);

  // ユーザー情報と施設情報の取得
  const fetchUserAndFacilityInfo = useCallback(async () => {
    try {
      addDebugLog("ユーザー・施設情報取得開始");
      
      // プロファイル情報からユーザー名を取得
      if (profile?.fullname) {
        setCurrentUserName(profile.fullname);
        addDebugLog(`ユーザー名を設定: ${profile.fullname}`);
      } else {
        // プロファイルからフルネームが取得できない場合はメールアドレスなどで代用
        const displayName = user?.email || user?.id?.substring(0, 8) || "ゲスト";
        setCurrentUserName(displayName);
        addDebugLog(`ユーザー名の代替を設定: ${displayName}`);
      }
      
      // 施設情報を取得
      if (profile?.facility_id) {
        addDebugLog(`施設情報取得開始: ID=${profile.facility_id}`);
        const { data: facilityData, error: facilityError } = await supabase
          .from("facilities")
          .select("name")
          .eq("id", profile.facility_id)
          .single();
          
        if (!facilityError && facilityData) {
          setFacilityName(facilityData.name);
          addDebugLog(`施設名を設定: ${facilityData.name}`);
        } else {
          addDebugLog(`施設情報取得エラー: ${facilityError?.message || "不明なエラー"}`);
          // エラーがあっても処理を継続
        }
      } else {
        // 施設IDがない場合も処理を継続
        addDebugLog("施設IDがありません");
      }
      
      addDebugLog("ユーザー・施設情報取得完了");
    } catch (error) {
      addDebugLog("ユーザーおよび施設情報取得エラー: " + JSON.stringify(error));
      // エラーがあっても処理を継続
    }
  }, [profile, user, addDebugLog]);

  // コンポーネントマウント時にユーザー情報と施設情報を取得
  useEffect(() => {
    if (!loading && user && profile) {
      fetchUserAndFacilityInfo();
      
      // カメラが確実に初期化されるよう少し遅延させる
      setShowCamera(false);
      const cameraInitTimeout = setTimeout(() => {
        setShowCamera(true);
        addDebugLog("カメラ自動起動");
      }, 1000);
      
      return () => clearTimeout(cameraInitTimeout);
    }
  }, [loading, user, profile, fetchUserAndFacilityInfo, addDebugLog]);

  // 試薬登録処理
  const registerReagent = async (startUsage: boolean) => {
    try {
      setIsSubmitting(true);
      setError("");
      
      const formValues = getValues();
      
      // URLパラメータから部署情報が設定されている場合は上書き
      if (departmentName) {
        formValues.department = departmentName;
        addDebugLog(`部署情報を上書き - 部署名: ${departmentName}`);
      }
      
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
        department: formValues.department, // 部署名のみを使用
        name: formValues.reagentName,
        specification: formValues.specification || "",
        "lotNo": formValues.lotNo, // 大文字小文字を正確に
        "expirationDate": formValues.expirationDate, // 大文字小文字を正確に
        "registrationDate": getJstTimestamp(), // 日本時間に変換して保存
        "registeredBy": userData.user.id, // 大文字小文字を正確に
        used: startUsage,
        "used_at": startUsage ? getJstTimestamp() : null, // 日本時間に変換して保存
        "used_by": startUsage ? userData.user.id : null,
        unit: formValues.unit || "", // 単位（フォームから取得）
        facility_id: profileData.facility_id, // ユーザープロファイルから取得した施設ID
        jan_code: formValues.janCode || "", // JANコード
      };
      addDebugLog("試薬データ作成: " + JSON.stringify(reagentData));
      
      // 重要なフィールドの確認
      addDebugLog(`重要フィールド確認 - facility_id: ${reagentData.facility_id}, department: ${reagentData.department}`);
      
      if (!reagentData.facility_id) {
        setError("施設IDが取得できません。もう一度ログインしてください。");
        return;
      }
      
      if (!reagentData.department) {
        setError("部署が設定されていません。部署を選択してください。");
        return;
      }

      // 試薬データの登録
      addDebugLog("試薬データ登録開始");
      try {
        // 認証情報はsupabaseクライアントが自動的に使用するため明示的に設定する必要はない
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
        addDebugLog("試薬データ登録エラー: " + JSON.stringify(error));
        setError("試薬登録中にエラーが発生しました。後でもう一度お試しください。");
      }
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
      
      // URLパラメータから設定された部署情報を保持
      if (departmentName) {
        setValue("department", departmentName);
      }
      
      // 検出結果を設定
      setBarcodeDetected(success);
      return success;
    },
    [products, setValue, addDebugLog, departmentName]
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
        
        // URLパラメータから設定された部署情報を保持
        if (departmentName) {
          setValue("department", departmentName);
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
    [parseGS1Barcode, products, setValue, addDebugLog, departmentName]
  );

  // 2次元バーコード専用のパース処理（QRコード、データマトリックスなど）
  const parseQRCode = useCallback(
    (originalBarcode: string) => {
      addDebugLog("2次元バーコードのパース処理を実行: " + originalBarcode);
      
      // QRコード特有の形式（例: 9114175095 102995266 17270800）
      // スペースで区切られたフォーマットの処理
      const qrParts = originalBarcode.split(/\s+/);
      let gtin: string | null = null;
      let lot: string | null = null;
      let expiry: string | null = null;
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
      
      // URLパラメータから設定された部署情報を保持
      if (departmentName) {
        setValue("department", departmentName);
      }
      
      // 成功したか、パースできなかった場合は汎用パーサーを試す
      if (success) {
        return true;
      } else {
        return parseGS1Barcode(originalBarcode);
      }
    },
    [parseGS1Barcode, products, setValue, addDebugLog, departmentName]
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
      
      // URLパラメータから部署情報が設定されている場合は再設定
      if (departmentName) {
        setValue("department", departmentName);
      }
      
      if (success) {
        addDebugLog("バーコード処理成功");
      } else {
        addDebugLog("バーコード処理失敗、手動入力必要");
      }
    },
    [parseGS1Barcode, parseLinearBarcode, parseQRCode, addDebugLog, departmentName, setValue]
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
    
    // 部署情報のチェック
    const formValues = getValues();
    if (!formValues.department) {
      setError("部署が未選択です。試薬を登録する部署を選択してください。");
      toast({
        title: "部署未選択",
        description: "試薬を登録する部署を選択してください",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }
    
    // 確認ダイアログを表示
    const confirmMessage = "試薬を登録します。よろしいですか？";
    if (window.confirm(confirmMessage)) {
      // 使用開始する場合は true, しない場合は false
      registerReagent(false);
    }
  };

  // カメラ操作ボタン
  const toggleCamera = () => {
    addDebugLog(`カメラ表示切替: ${!showCamera ? "ON" : "OFF"}`);
    setShowCamera(!showCamera);
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen w-full flex flex-col bg-white">
        {/* 共通ヘッダーコンポーネントを使用 */}
        <AppHeader showBackButton={true} title="Clinical reagent manager" />

        <div className="flex-grow flex flex-col items-center py-8 px-4">
          <div className="max-w-4xl w-full mx-auto">
            <div className="text-center mb-8">
              <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-2xl p-6 shadow-sm border border-[#8167a9]/10">
                <div className="space-y-2">
                  <h1
                    className="text-4xl font-bold bg-gradient-to-r from-[#8167a9] to-[#a18cd1] bg-clip-text text-transparent"
                  >
                    試薬登録
                  </h1>
                  <h2
                    className="text-3xl bg-gradient-to-r from-[#8167a9] to-[#a18cd1] bg-clip-text text-transparent"
                  >
                    『{departmentName}』
                  </h2>
                  <p className="text-lg text-[#8167a9] font-medium">
                    Barcode scan select 1D/2D for automatic data entry
                  </p>
                </div>
              </div>

              {/* ユーザー・部署・施設情報表示 */}
              <div className="bg-accent/30 border border-border p-4 rounded-lg animate-fadeIn mb-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between">
                  <div>
                    {facilityName && (
                      <p className="text-sm text-foreground">
                        <span className="font-semibold">施設「{facilityName}」</span>
                      </p>
                    )}
                    {currentUserName && (
                      <p className="text-sm text-foreground">
                        <span className="font-semibold">{currentUserName}さん</span>として登録します
                      </p>
                    )}
                  </div>
                  <div>
                    {departmentName ? (
                      <p className="text-sm text-foreground mt-2 md:mt-0">
                        <span className="font-semibold">部署: {departmentName}</span>
                      </p>
                    ) : (
                      <p className="text-sm text-amber-600 mt-2 md:mt-0">
                        <span className="font-semibold">⚠️ 部署が選択されていません</span>
                      </p>
                    )}
                  </div>
                </div>
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
                    className="inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow hover:bg-primary/90 h-9 px-8 mx-auto bg-gradient-to-r from-pink-300 to-purple-400 hover:from-pink-300 hover:to-purple-400 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300"
                  >
                    {showCamera ? "カメラを閉じる" : "カメラを再起動する"}
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
                        <Label htmlFor="department">部署名 <span className="text-red-500">*</span></Label>
                        {departmentName ? (
                          <div className="flex space-x-2">
                            <Input
                              id="department"
                              value={departmentName}
                              readOnly
                              className="bg-gray-100"
                            />
                            <input type="hidden" {...register("department")} value={departmentName} />
                          </div>
                        ) : (
                          <>
                            <select
                              id="department"
                              {...register("department")}
                              className="w-full p-2 border border-gray-300 rounded-md"
                              required
                            >
                              <option value="">部署を選択してください</option>
                              {departments.map(dept => (
                                <option key={dept.id} value={dept.name}>
                                  {dept.name}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
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
                          className="inline-flex items-center justify-center gap-2 whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 shadow hover:bg-primary/90 h-9 px-4 w-full bg-gradient-to-r from-pink-300 to-purple-400 hover:from-pink-300 hover:to-purple-400 text-white font-medium text-lg py-3 rounded-xl transition-all duration-300" 
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