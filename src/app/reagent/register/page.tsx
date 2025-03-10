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
// @ts-expect-error Quaggaモジュールの型定義が見つからないため
import Quagga from "quagga";

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
  const [showCamera, setShowCamera] = useState<boolean>(true);
  const [manualCaptureMode, setManualCaptureMode] = useState<boolean>(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  
  // 部署一覧、商品CSV、バーコード読み取り状況
  const [departments, setDepartments] = useState<{id: string, name: string}[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [barcodeDetected, setBarcodeDetected] = useState<boolean>(false);
  const [failCount, setFailCount] = useState<number>(0);
  
  // Quagga用のマウントポイント参照
  const quaggaRef = useRef<HTMLDivElement>(null);
  const processing = useRef<boolean>(false);
  const lastScannedCode = useRef<string | null>(null);
  
  // 高解像度カメラ用の参照
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // デバッグログ表示用
  const [debugLog, setDebugLog] = useState<string[]>([]);

  // デバッグログ用関数
  const addDebugLog = useCallback((msg: string) => {
    console.log(msg);
    setDebugLog((prev) => [...prev, msg]);
  }, []);

  // カメラ停止関数
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      addDebugLog("カメラ停止");
    }
  }, [addDebugLog]);

  // GS1バーコードのパース処理
  const parseGS1Barcode = useCallback(
    (barcode: string) => {
      addDebugLog("GS1バーコード解析開始");
      // 数字以外の文字を除去する前のバーコードを保存
      const originalBarcode = barcode;
      // 数字のみに変換
      const cleanBarcode = barcode.replace(/[^\d]/g, "");
      addDebugLog(`クリーニング後バーコード: ${cleanBarcode}`);

      // より柔軟なGS1正規表現 - 01と17と10のAIを探す
      const regex = /01(\d{14}).*?17(\d{6}).*?10([^]*?)(?:$|(?:30|21|91))/;
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
        
        // ロット番号の処理 - 数字だけでなく英数字も処理
        // 元のバーコードから英数字のロット番号を抽出
        const lotRegex = /10([A-Za-z0-9]+)/;
        const lotMatch = originalBarcode.match(lotRegex);
        if (lotMatch) {
          setValue("lotNo", lotMatch[1]);
          addDebugLog("元バーコードからロット番号抽出: " + lotMatch[1]);
        } else {
          setValue("lotNo", lot);
          addDebugLog("数字のみのロット番号使用: " + lot);
        }
        
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
        Quagga.stop();
        stopCamera();
      } else {
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
            Quagga.stop();
            stopCamera();
            return;
          }
        }
        
        addDebugLog("正規表現マッチ失敗。GS1ではない可能性: " + cleanBarcode);
        setError("GS1バーコードの正規表現にマッチしませんでした");
      }
    },
    [addDebugLog, products, setValue, stopCamera]
  );

  // カメラ初期化関数
  const initCamera = useCallback(async () => {
    if (!videoRef.current) return;
    
    try {
      // 高解像度設定でカメラを取得
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 3840 }, // 4K
          height: { ideal: 2160 },
          facingMode: "environment",
          frameRate: { ideal: 30 }
        },
        audio: false
      });
      
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      
      // ビデオが読み込まれたら実際の解像度をログに出力
      videoRef.current.onloadedmetadata = () => {
        if (videoRef.current) {
          addDebugLog(`カメラ解像度: ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`);
        }
      };
      
      videoRef.current.play();
      addDebugLog("高解像度カメラ初期化成功");
    } catch (err) {
      addDebugLog("カメラ初期化エラー: " + String(err));
      setError("カメラの起動に失敗しました。カメラへのアクセス許可を確認してください。");
    }
  }, [addDebugLog]);

  // ページ初期表示時にカメラON
  useEffect(() => {
    addDebugLog("ページロード完了。カメラを自動起動します。");
    setShowCamera(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        const parsed = Papa.parse(csvText, { header: true });
        setProducts(parsed.data as Product[]);
        addDebugLog("商品CSV読み込み成功");
      } catch (error) {
        console.error("CSV読み込みエラー", error);
        addDebugLog("CSV読み込みエラー");
      }
    };
    fetchProducts();
  }, []);

  // Quaggaの初期化と実行
  useEffect(() => {
    if (showCamera && !manualCaptureMode && quaggaRef.current) {
      addDebugLog("Quagga初期化開始");
      
      // Quaggaの設定
      Quagga.init({
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: quaggaRef.current,
          constraints: {
            width: { min: 640 },
            height: { min: 480 },
            facingMode: "environment", // バックカメラを使用
            aspectRatio: { min: 1, max: 2 }
          },
        },
        locator: {
          patchSize: "medium",
          halfSample: true
        },
        numOfWorkers: navigator.hardwareConcurrency || 4,
        decoder: {
          readers: [
            "ean_reader",
            "ean_8_reader",
            "code_128_reader",
            "code_39_reader",
            "upc_reader",
            "upc_e_reader"
          ],
        },
        locate: true
      }, function(err: Error | null) {
        if (err) {
          addDebugLog("Quagga初期化エラー: " + err);
          return;
        }
        
        addDebugLog("Quagga初期化成功。スキャン開始");
        Quagga.start();
      });

      // バーコード検出時のハンドラ
      Quagga.onDetected((result: { codeResult?: { code: string } }) => {
        if (!processing.current && result.codeResult) {
          processing.current = true;
          const code = result.codeResult.code;
          
          if (code && code !== lastScannedCode.current) {
            lastScannedCode.current = code;
            addDebugLog("Quaggaバーコード認識成功: " + code);
            parseGS1Barcode(code);
          }
          
          setTimeout(() => {
            processing.current = false;
          }, 1000); // 重複認識防止のため1秒待機
        }
      });

      // エラー処理
      Quagga.onProcessed((result: unknown) => {
        if (!result) {
          setFailCount((prev) => prev + 1);
          if (failCount >= 5) {
            setError("バーコードが正しく読み取れませんでした。カメラの位置を調整してください。");
          }
          return;
        }
      });

      return () => {
        addDebugLog("Quagga停止");
        Quagga.stop();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCamera, manualCaptureMode]);

  // 高解像度カメラの初期化と停止を管理
  useEffect(() => {
    if (showCamera && manualCaptureMode) {
      initCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [showCamera, manualCaptureMode, initCamera, stopCamera]);

  // テスト画像解析用
  const decodeFromStaticImage = () => {
    addDebugLog("テスト画像からバーコード解析開始");
    
    const img = new Image();
    img.src = "/barcode-02.png";
    img.onload = function() {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      
      // ダミーのdiv要素を作成してtargetとして使用
      const dummyElement = document.createElement("div");
      
      Quagga.decodeSingle({
        inputStream: {
          name: "Static Image",
          type: "ImageStream",
          target: dummyElement,
          constraints: {
            width: img.width,
            height: img.height,
            facingMode: "environment"
          }
        },
        decoder: {
          readers: [
            "ean_reader",
            "ean_8_reader", 
            "code_128_reader",
            "code_39_reader",
            "upc_reader",
            "upc_e_reader"
          ]
        },
        locate: true,
        src: canvas.toDataURL()
      }, function(result: { codeResult?: { code: string } } | null) {
        if (result && result.codeResult) {
          const testResultText = result.codeResult.code;
          addDebugLog("テスト画像バーコード認識成功: " + testResultText);
          parseGS1Barcode(testResultText);
        } else {
          addDebugLog("テスト画像バーコード認識失敗");
          setError("テスト画像バーコード解析に失敗しました");
        }
      });
    };
  };

  // 手動で「バーコード撮影を再開」
  const handleBarcodeScan = () => {
    addDebugLog("カメラ表示開始（手動）");
    setShowCamera(true);
    setManualCaptureMode(false);
  };

  // 追加: マニュアル撮影モード
  const handleManualCaptureMode = () => {
    setManualCaptureMode((prev) => !prev); // ON/OFF切り替え
    setCapturedImage(null);
    addDebugLog("手動撮影モード: " + (!manualCaptureMode ? "開始" : "終了"));
    
    if (!manualCaptureMode) {
      // 自動モードからマニュアルモードに切り替える場合はQuaggaを停止
      Quagga.stop();
      // 少し遅延させてカメラを初期化
      setTimeout(initCamera, 500);
    } else {
      stopCamera();
    }
  };

  // 手動撮影で1枚キャプチャ
  const handleCaptureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // キャンバスをビデオと同じサイズに設定
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // ビデオフレームをキャンバスに描画
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // キャンバスから画像データを取得
    const imageSrc = canvas.toDataURL('image/jpeg', 1.0); // 最高品質
    setCapturedImage(imageSrc);
    addDebugLog(`画像を手動でキャプチャしました (${video.videoWidth}x${video.videoHeight})`);
  };

  // 手動撮影でキャプチャした画像を解析
  const handleAnalyzeCapturedImage = () => {
    if (!capturedImage) return;
    addDebugLog("手動撮影画像でバーコード解析を試みます");
    
    // ダミーのdiv要素を作成してtargetとして使用
    const dummyElement = document.createElement("div");
    
    Quagga.decodeSingle({
      inputStream: {
        name: "Captured Image",
        type: "ImageStream",
        target: dummyElement,
        constraints: {
          width: 800,
          height: 600,
          facingMode: "environment"
        }
      },
      decoder: {
        readers: [
          "ean_reader",
          "ean_8_reader", 
          "code_128_reader",
          "code_39_reader",
          "upc_reader",
          "upc_e_reader"
        ]
      },
      locate: true,
      src: capturedImage
    }, function(result: { codeResult?: { code: string } } | null) {
      if (result && result.codeResult) {
        const codeText = result.codeResult.code;
        addDebugLog("手動撮影画像のバーコード認識成功: " + codeText);
        parseGS1Barcode(codeText);
      } else {
        addDebugLog("手動撮影画像バーコード認識失敗");
        setError("手動撮影画像バーコード解析に失敗しました");
      }
    });
  };

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
      
      // ユーザーの施設IDを取得
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("facility_id")
        .eq("id", currentUser.id)
        .single();
        
      if (profileError || !profileData?.facility_id) {
        setError("施設情報の取得に失敗しました");
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
          facility_id: profileData.facility_id, // 施設IDを設定
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
        <Button variant="ghost" size="icon" onClick={() => router.push("/depart")}>
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
                {!manualCaptureMode ? (
                  // Quagga用のマウントポイント
                  <div 
                    ref={quaggaRef} 
                    className="w-full h-64 rounded overflow-hidden relative border"
                    style={{ position: 'relative' }}
                  />
                ) : (
                  // 高解像度カメラ用のビデオ要素
                  <div className="relative">
                    <video
                      ref={videoRef}
                      className="w-full h-auto rounded"
                      playsInline
                      muted
                    />
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                  </div>
                )}

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
                    <Button variant="destructive" onClick={() => {
                      setShowCamera(false);
                      Quagga.stop();
                    }}>
                      キャンセル
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* フォーム */}
            <form className="space-y-4">
              <div className="mb-4">
                <Label htmlFor="department">部署</Label>
                <Input
                  id="department"
                  list="departments-list"
                  {...register("department", { required: "部署は必須です" })}
                  className="mt-1"
                />
                <datalist id="departments-list">
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.name} />
                  ))}
                </datalist>
                {errors.department && (
                  <p className="text-red-500 text-sm mt-1">
                    {errors.department.message}
                  </p>
                )}
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
        {debugLog.length > 0 && (
          <div className="mt-4 p-2 bg-gray-100 border rounded">
            <h2 className="font-bold mb-2">デバッグログ</h2>
            <pre className="text-xs whitespace-pre-wrap">
              {debugLog
                .filter((log) =>
                  log.startsWith("Quagga") ||
                  log.startsWith("GS1") ||
                  log.startsWith("正規表現") ||
                  log.startsWith("商品名") ||
                  log.startsWith("JANコード") ||
                  log.startsWith("カメラ解像度") ||
                  log.startsWith("画像を手動でキャプチャ")
                )
                .join("\n")}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}