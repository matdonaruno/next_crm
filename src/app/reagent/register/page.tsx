"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import Webcam from "react-webcam";
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
import {
  BrowserMultiFormatReader,
  DecodeHintType,
  BarcodeFormat,
  Result,
} from "@zxing/library";
import { Home } from "lucide-react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import NextImage from "next/image";


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
  const { register, setValue, getValues, reset } = useForm<FormValues>();
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // カメラとバーコード解析関連ステート
  const [showCamera, setShowCamera] = useState<boolean>(true);
  const [manualCaptureMode, setManualCaptureMode] = useState<boolean>(false); // 追加
  const [capturedImage, setCapturedImage] = useState<string | null>(null);   // 追加

  // 部署一覧、商品CSV、バーコード読み取り状況
  const [departments, setDepartments] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [barcodeDetected, setBarcodeDetected] = useState<boolean>(false);
  const [failCount, setFailCount] = useState<number>(0);

  // デバッグログ表示用
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // Webcamや解析状態管理
  const webcamRef = useRef<Webcam>(null);
  const processing = useRef<boolean>(false);
  const lastScannedCode = useRef<string | null>(null);

  // デバッグログ用関数
  const addDebugLog = useCallback((msg: string) => {
    console.log(msg);
    setDebugLogs((prev) => [...prev, msg]);
  }, []);

  // ページ初期表示時にカメラON
  useEffect(() => {
    addDebugLog("ページロード完了。カメラを自動起動します。");
    setShowCamera(true);
  }, [addDebugLog]);

  // 部署一覧取得（supabaseから）
  useEffect(() => {
    const fetchDepartments = async () => {
      const { data, error } = await supabase.from("reagents").select("department");
      if (error) {
        console.error("Error fetching departments:", error);
      } else if (data) {
        const unique = Array.from(
          new Set(data.map((item: { department: string }) => item.department).filter(Boolean))
        );
        setDepartments(unique);
        unique.forEach((dept) => addDebugLog("部署一覧取得: " + dept));
      }
    };
    fetchDepartments();
  }, [addDebugLog]);

  // 商品CSV（マスタ）の読み込み
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch("/products.csv");
        const csvText = await response.text();
        const parsed = Papa.parse(csvText, { header: true });
        setProducts(parsed.data as Product[]);
        addDebugLog("商品CSV読み込み成功");
      } catch (error) {
        console.error("CSV読み込みエラー", error);
        addDebugLog("CSV読み込みエラー");
      }
    };
    fetchProducts();
  }, [addDebugLog]);

  // react-webcam のビデオ設定（連続フォーカスなど）
  const videoConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    facingMode: "environment",
    focusMode: "continuous",
  };

  // ZXing リーダーのヒント設定
  const hints = useMemo<Map<DecodeHintType, boolean | BarcodeFormat[]>>(() => {
    const map = new Map<DecodeHintType, boolean | BarcodeFormat[]>();
    map.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ]);
    map.set(DecodeHintType.TRY_HARDER, true);
    map.set(DecodeHintType.ASSUME_GS1, true);
    return map;
  }, []);

  // codeReader の生成
  const codeReader = useMemo(() => new BrowserMultiFormatReader(hints, 4000), [hints]);

  // 手動で「バーコード撮影を再開」
  const handleBarcodeScan = () => {
    addDebugLog("カメラ表示開始（手動）");
    setShowCamera(true);
  };

  // テスト画像解析用
  const decodeFromStaticImage = () => {
    addDebugLog("テスト画像からバーコード解析開始");
    const testImage = new Image();
    testImage.src = "/barcode-02.png";
    testImage.onload = () => {
      addDebugLog("テスト画像読み込み完了。バーコード解析開始（静的画像）");
      codeReader
        .decodeFromImageElement(testImage)
        .then((result: Result) => {
          const testResultText = result.getText();
          addDebugLog("テスト画像バーコード認識成功: " + testResultText);
          parseGS1Barcode(testResultText);
        })
        .catch((e: unknown) => {
          console.error("テスト画像解析エラー:", e);
          setError("テスト画像バーコード解析に失敗しました");
        });
    };
  };

  // 追加: マニュアル撮影モード
  const handleManualCaptureMode = () => {
    setManualCaptureMode((prev) => !prev); // ON/OFF切り替え
    setCapturedImage(null);
    addDebugLog("手動撮影モード: " + (!manualCaptureMode ? "開始" : "終了"));
  };

  // 手動撮影で1枚キャプチャ
  const handleCaptureImage = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        setCapturedImage(imageSrc);
        addDebugLog("画像を手動でキャプチャしました");
      }
    }
  };

  // 手動撮影でキャプチャした画像を解析
  const handleAnalyzeCapturedImage = () => {
    if (!capturedImage) return;
    addDebugLog("手動撮影画像でバーコード解析を試みます");
    const image = new Image();
    image.src = capturedImage;
    image.onload = () => {
      codeReader
        .decodeFromImageElement(image)
        .then((result: Result) => {
          const codeText = result.getText();
          addDebugLog("手動撮影画像のバーコード認識成功: " + codeText);
          parseGS1Barcode(codeText);
        })
        .catch((e: unknown) => {
          console.error("手動撮影画像解析エラー:", e);
          setError("手動撮影画像バーコード解析に失敗しました");
        });
    };
  };

  // GS1バーコードのパース処理
  const parseGS1Barcode = useCallback(
    (barcode: string) => {
      addDebugLog("GS1バーコード解析開始");
      const cleanBarcode = barcode.replace(/[^\d]/g, "");
      addDebugLog(`クリーニング後バーコード: ${cleanBarcode}`);

      // GS1を想定した正規表現
      const regex = /^01(\d{14})17(\d{6})10(\d+)(?:30(\d+))?$/;
      const match = cleanBarcode.match(regex);
      if (match) {
        addDebugLog("正規表現マッチ成功");
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
        // GS1でない場合の処理をここで行っても良い (JAN/EANとして処理 など)
        addDebugLog("正規表現マッチ失敗。GS1ではない可能性: " + cleanBarcode);
        // 例: もしEAN/JANならCSVのcodeと一致するか調べる場合
        // parseJANBarcode(cleanBarcode); ... のようにしてもOK
        setError("GS1バーコードの正規表現にマッチしませんでした");
      }
    },
    [addDebugLog, products, setValue]
  );

  // JANコード手入力 → CSVマスタを探す
  const handleJanCodeBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const typedCode = e.target.value.trim();
    if (!typedCode) return; // 未入力の場合は何もしない

    addDebugLog("JANコード手入力: " + typedCode);

    // CSV上で code === typedCode の商品を探す
    const product = products.find((p) => p.code === typedCode);
    if (product) {
      addDebugLog("JANコード一致: " + product.name);
      setValue("reagentName", product.name);
      // 規格などがあるならセット、無ければ「規格未設定」
      setValue("specification", "規格未設定");
      // 他にLotNoや期限を紐付けていればセットする
      // ここでは単純に名前だけをルックアップする例
      // setValue("lotNo", "JAN入力ロット");
      // setValue("expirationDate", "2025-12-31");
    } else {
      addDebugLog("JANコード: CSVに該当なし");
      setError("JANコードに該当する商品がCSVに見つかりませんでした");
    }
  };

  // 自動読み取り（decodeFromVideoElement）: 従来の処理
  useEffect(() => {
    let active = true;
    const videoElem = webcamRef.current?.video;
    if (showCamera && videoElem && !manualCaptureMode) {
      const detectFrame = async () => {
        if (!active) return;
        if (processing.current) return;
        processing.current = true;
        try {
          const result = await codeReader.decodeFromVideoElement(videoElem);
          if (result && result.getText() !== lastScannedCode.current) {
            lastScannedCode.current = result.getText();
            addDebugLog("ZXingバーコード認識成功: " + result.getText());
            parseGS1Barcode(result.getText());
          }
        } catch (err: unknown) {
          if (err instanceof Error && !err.message.includes("NotFoundException")) {
            addDebugLog("バーコード解析エラー: " + err.message);
            setFailCount((prev) => prev + 1);
            if (failCount >= 2) {
              setError("バーコードが正しく読み取れませんでした。カメラの位置を調整してください。");
            }
          }
        } finally {
          processing.current = false;
          if (active && showCamera && !manualCaptureMode) {
            requestAnimationFrame(detectFrame);
          }
        }
      };
      requestAnimationFrame(detectFrame);
    }
    return () => {
      active = false;
      codeReader.reset();
    };
  }, [
    showCamera,
    manualCaptureMode,
    addDebugLog,
    codeReader,
    failCount,
    parseGS1Barcode,
  ]);

  // 次へボタン：フォームクリアと状態リセット（連続登録用）
  const handleNext = () => {
    reset();
    setError("");
    setFailCount(0);
    setBarcodeDetected(false);
    addDebugLog("フォームクリア。次のバーコード入力へ");
    setShowCamera(true);
    setManualCaptureMode(false);
    setCapturedImage(null);
  };

  // （サンプル）reagentNameのonBlur
  const handleReagentNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    addDebugLog("handleReagentNameBlur triggered with value: " + e.target.value);
  };

  // ユーザープロフィール確認／作成関数
  const ensureUserProfile = async (
    user: { id: string; email?: string; user_metadata: { fullName?: string } }
  ): Promise<boolean> => {
    const userEmail = user.email ?? "";
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      console.error("Error checking profile:", error.message);
      return false;
    }
    if (!data) {
      const { error: insertError } = await supabase.from("profiles").insert({
        id: user.id,
        fullname: user.user_metadata.fullName || "",
        email: userEmail,
      });
      if (insertError) {
        console.error("Error inserting profile:", insertError.message);
        return false;
      }
    }
    return true;
  };

  // 試薬登録処理
  const registerReagent = async (startUsage: boolean) => {
    setIsSubmitting(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        setError("ユーザー情報の取得に失敗しました");
        setIsSubmitting(false);
        return;
      }
      const currentUser = userData.user;
      const profileOk = await ensureUserProfile(currentUser);
      if (!profileOk) {
        setError("ユーザープロフィールの作成に失敗しました");
        setIsSubmitting(false);
        return;
      }
      const registeredBy = currentUser.id;
      const formData = getValues();
      const { error } = await supabase.from("reagents").insert([
        {
          department: formData.department,
          name: formData.reagentName,
          specification: formData.specification,
          lotNo: formData.lotNo,
          expirationDate: formData.expirationDate,
          registeredBy: registeredBy,
          used: startUsage,
          used_at: startUsage ? new Date().toISOString() : null,
          ended_at: null,
        },
      ]);
      if (error) {
        setError(error.message);
        setIsSubmitting(false);
        return;
      }
      router.push("/");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(String(err));
      }
    }
    setIsSubmitting(false);
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      {/* 右上に「ダッシュボードへ戻る」ボタン */}
      <div className="absolute top-4 right-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
          <Home className="h-6 w-6" />
        </Button>
      </div>

      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6">Register Reagent</h1>

        <Card>
          <CardHeader>
            <CardTitle>試薬パッケージ登録</CardTitle>
          </CardHeader>
          <CardContent className="relative">
            {error && !showCamera && <p className="text-red-500 mb-4">{error}</p>}

            {/* 自動解析・手動撮影のモード切り替えボタン */}
            <div className="flex space-x-2 mb-4">
              <Button onClick={handleBarcodeScan} variant="outline">
                自動読み取り (再開)
              </Button>
              <Button onClick={decodeFromStaticImage} variant="outline">
                テスト画像解析
              </Button>
              <Button onClick={handleManualCaptureMode} variant="outline">
                {manualCaptureMode ? "手動撮影モード終了" : "手動撮影モード開始"}
              </Button>
            </div>

            {/* カメラプレビュー or 手動撮影モード */}
            {showCamera && (
              <div className="mb-4 relative">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={videoConstraints}
                  className="w-full h-auto rounded"
                />

                {/* 手動撮影モードがONなら「写真を撮る」ボタンとプレビュー */}
                {manualCaptureMode && (
                  <div className="mt-2 space-y-2">
                    <Button onClick={handleCaptureImage}>写真を撮る</Button>
                    {capturedImage && (
                      <div>
                        <p>撮影した画像:</p>
                        <div className="relative w-full h-96 border">
                          <NextImage
                            src={capturedImage}
                            alt="Captured"
                            className="w-full max-h-96 object-contain border"
                          />
                        </div>
                        <Button
                          className="mt-2"
                          onClick={handleAnalyzeCapturedImage}
                        >
                          バーコード解析
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* 自動撮影モード中はキャンセルボタンを表示 */}
                {!manualCaptureMode && (
                  <div className="flex justify-center mt-2">
                    <Button variant="destructive" onClick={() => setShowCamera(false)}>
                      キャンセル
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* フォーム */}
            <form className="space-y-4">
              <div>
                <Label htmlFor="department">部署名</Label>
                <Input
                  id="department"
                  list="departments-list"
                  {...register("department", { required: true })}
                />
                <datalist id="departments-list">
                  {departments.map((dept) => (
                    <option key={dept} value={dept} />
                  ))}
                </datalist>
              </div>

              {/* 追加: JANコード */}
              <div>
                <Label htmlFor="janCode">JANコード</Label>
                <Input
                  id="janCode"
                  {...register("janCode", {
                    onBlur: handleJanCodeBlur,
                  })}
                  placeholder="JANまたはEANコード"
                />
              </div>

              <div>
                <Label htmlFor="reagentName">試薬名</Label>
                <Input
                  id="reagentName"
                  {...register("reagentName", {
                    required: true,
                    onBlur: handleReagentNameBlur,
                  })}
                />
              </div>

              <div>
                <Label htmlFor="specification">規格</Label>
                <Input
                  id="specification"
                  {...register("specification", { required: true })}
                />
              </div>

              <div>
                <Label htmlFor="lotNo">ロット番号</Label>
                <Input id="lotNo" {...register("lotNo", { required: true })} />
              </div>

              <div>
                <Label htmlFor="expirationDate">使用期限</Label>
                <Input
                  id="expirationDate"
                  type="date"
                  {...register("expirationDate", { required: true })}
                />
              </div>
            </form>
          </CardContent>
          <CardFooter className="flex justify-between space-x-4">
            <Button onClick={() => registerReagent(false)} disabled={isSubmitting} className="w-full">
              試薬の登録
            </Button>
            <Button onClick={() => registerReagent(true)} disabled={isSubmitting} className="w-full">
              試薬の登録＆使用開始
            </Button>
          </CardFooter>
        </Card>

        {/* 次へボタン（連続登録用） */}
        {barcodeDetected && (
          <div className="mt-4">
            <Button onClick={handleNext} variant="outline">
              次へ
            </Button>
          </div>
        )}

        {/* デバッグログ表示 */}
        {debugLogs.length > 0 && (
          <div className="mt-4 p-2 bg-gray-100 border rounded">
            <h2 className="font-bold mb-2">デバッグログ</h2>
            <pre className="text-xs whitespace-pre-wrap">
              {debugLogs
                .filter((log) =>
                  log.startsWith("ZXing") ||
                  log.startsWith("GS1") ||
                  log.startsWith("正規表現") ||
                  log.startsWith("商品名") ||
                  log.startsWith("JANコード")
                )
                .join("\n")}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
