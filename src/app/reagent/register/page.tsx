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
} from "@zxing/library";
import { Home } from "lucide-react";
import { useRequireAuth } from "@/hooks/useRequireAuth";

type FormValues = {
  department: string;
  reagentName: string;
  specification: string;
  lotNo: string;
  expirationDate: string;
};

// 商品マスタの型
interface Product {
  code: string;
  name: string;
}

export default function ReagentRegistration() {
  useRequireAuth();
  const { register, setValue, getValues, reset } = useForm<FormValues>();
  const router = useRouter();
  const [error, setError] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showCamera, setShowCamera] = useState<boolean>(false);
  const [scanning, setScanning] = useState<boolean>(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [registrationComplete, setRegistrationComplete] = useState<boolean>(false);
  const webcamRef = useRef<Webcam>(null);
  const [departments, setDepartments] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // デバッグログ用関数
  const addDebugLog = (msg: string) => {
    console.log(msg);
    setDebugLogs((prev) => [...prev, msg]);
  };

  // ページロード時に自動でカメラ起動
  useEffect(() => {
    addDebugLog("ページロード完了。カメラを自動起動します。");
    setShowCamera(true);
  }, []);

  // 過去の登録から部署一覧を取得（datalist用）
  useEffect(() => {
    const fetchDepartments = async () => {
      const { data, error } = await supabase.from("reagents").select("department");
      if (error) {
        console.error("Error fetching departments:", error);
      } else if (data) {
        const unique = Array.from(
          new Set(data.map((item) => item.department).filter(Boolean))
        );
        setDepartments(unique as string[]);
        unique.forEach((dept) => addDebugLog("部署一覧取得: " + dept));
      }
    };
    fetchDepartments();
  }, []);

  // 商品CSV（マスタ）を読み込み（内容の詳細は表示せず成功のみログ出力）
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await fetch("/products.csv");
        const csvText = await response.text();
        const parsed = Papa.parse(csvText, { header: true });
        const prods = parsed.data as Product[];
        setProducts(prods);
        addDebugLog("商品CSV読み込み成功");
      } catch (error) {
        console.error("CSV読み込みエラー", error);
        addDebugLog("CSV読み込みエラー: " + (error instanceof Error ? error.message : String(error)));
      }
    };
    fetchProducts();
  }, []);

  // react-webcam の設定（背面カメラ）
  const videoConstraints = {
    width: 1280,
    height: 720,
    facingMode: "environment",
  };

  // ZXing リーダーのヒント設定（GS1バーコード用）
  const codeReader = useMemo(() => {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    return new BrowserMultiFormatReader(hints);
  }, []);

  // バーコード撮影ボタン（手動起動）
  const handleBarcodeScan = () => {
    addDebugLog("カメラ表示開始（手動）");
    setShowCamera(true);
    setError("");
  };

  // テスト画像での解析ボタン
  const decodeFromStaticImage = () => {
    addDebugLog("テスト画像からバーコード解析開始");
    const testImage = new Image();
    testImage.src = "/barcode-02.png";
    testImage.onload = () => {
      addDebugLog("テスト画像読み込み完了。バーコード解析開始（静的画像）");
      codeReader
        .decodeFromImageElement(testImage)
        .then((result) => {
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

  // GS1バーコードのパース処理
  const parseGS1Barcode = useCallback((barcode: string) => {
    addDebugLog("GS1バーコード解析開始");
    const regex = /^01(\d{14})17(\d{6})10(\d+)(?:30(\d+))?$/;
    const match = barcode.match(regex);
    if (match) {
      addDebugLog("正規表現マッチ成功");
      const gtin = match[1];
      const expiryRaw = match[2];
      const lot = match[3];
      addDebugLog("GTIN: " + gtin);
      addDebugLog("生の有効期限: " + expiryRaw);
      addDebugLog("ロット番号: " + lot);
      const yearPrefix = parseInt(expiryRaw.substring(0, 2)) >= 50 ? "19" : "20";
      const formattedExpiry = `${yearPrefix}${expiryRaw.substring(0, 2)}-${expiryRaw.substring(2, 4)}-${expiryRaw.substring(4, 6)}`;
      setValue("expirationDate", formattedExpiry);
      setValue("lotNo", lot);
      addDebugLog("有効期限変換: " + formattedExpiry);

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
      setError("");
      setShowCamera(false);
    } else {
      addDebugLog("正規表現マッチ失敗。バーコード内容: " + barcode);
      setError("バーコードの解析に失敗しました");
    }
  }, [products, setValue]);

  // 撮影してバーコード解析を実行（自動撮影ループから呼び出す）
  const captureAndDecodeBarcode = useCallback(async () => {
    if (webcamRef.current) {
      addDebugLog("ウェブカムからスクリーンショット取得開始");
      setScanning(true);
      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) {
        setError("画像の取得に失敗しました");
        setScanning(false);
        return;
      }
      addDebugLog("画像の取得に成功");

      const image = new Image();
      image.src = imageSrc;
      image.onload = async () => {
        addDebugLog("画像読み込み完了。バーコード解析開始");
        try {
          const result = await codeReader.decodeFromImageElement(image);
          const resultText = result.getText();
          addDebugLog("ZXingバーコード認識成功: " + resultText);
          parseGS1Barcode(resultText);
        } catch (err: unknown) {
          if (err instanceof Error) {
            addDebugLog("バーコード解析エラー: " + err.message);
          } else {
            addDebugLog("バーコード解析エラー: " + String(err));
          }
        } finally {
          setScanning(false);
        }
      };
      image.onerror = () => {
        setError("画像の読み込みに失敗しました");
        setScanning(false);
      };
    }
  }, [codeReader, parseGS1Barcode]);

  // 自動撮影ループ（カメラ表示中で登録完了前は定期的にキャプチャ）
  useEffect(() => {
    if (showCamera && !registrationComplete) {
      const intervalId = setInterval(() => {
        captureAndDecodeBarcode();
      }, 1500);
      return () => clearInterval(intervalId);
    }
  }, [showCamera, registrationComplete, captureAndDecodeBarcode]);

  // 試薬名入力後、過去の登録履歴から最新の部署情報を自動補完
  const handleReagentNameBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const reagentName = e.target.value;
    if (!reagentName) return;
    const { data, error } = await supabase
      .from("reagents")
      .select("department")
      .eq("name", reagentName)
      .order("registrationDate", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Error fetching previous department:", error);
    } else if (data && data.department) {
      setValue("department", data.department);
      addDebugLog("過去の部署情報自動補完: " + data.department);
    }
  };

  // 現在のユーザーのプロフィールが存在するか確認し、なければ作成する関数
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
          used: startUsage ? true : false,
          used_at: startUsage ? new Date().toISOString() : null,
          ended_at: null,
        },
      ]);

      if (error) {
        setError(error.message);
        setIsSubmitting(false);
        return;
      }

      // 登録成功時は登録完了状態にする（ページ遷移せずに次の登録を可能にする）
      addDebugLog("試薬登録成功");
      setRegistrationComplete(true);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(String(err));
      }
    }
    setIsSubmitting(false);
  };

  // 「次へ」ボタン押下時の処理（フォーム、状態のリセット）
  const handleNext = () => {
    reset();
    setError("");
    setRegistrationComplete(false);
    addDebugLog("フォームリセット。次の試薬登録へ");
    setShowCamera(true);
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
          <CardContent>
            {error && !scanning && (
              <p className="text-red-500 mb-4">{error}</p>
            )}
            {scanning && (
              <p className="text-sm text-gray-600 mb-4">読み取り中…</p>
            )}
            <div className="mb-4 space-y-2">
              <Button onClick={handleBarcodeScan} variant="outline" className="w-full">
                バーコード撮影
              </Button>
              <Button onClick={decodeFromStaticImage} variant="outline" className="w-full">
                テスト画像で解析
              </Button>
            </div>
            {showCamera && (
              <div className="mb-4">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={videoConstraints}
                  className="w-full h-auto rounded"
                />
                <div className="flex justify-between mt-2">
                  <Button onClick={captureAndDecodeBarcode} disabled={false}>
                    撮影して解析
                  </Button>
                  <Button variant="destructive" onClick={() => setShowCamera(false)}>
                    キャンセル
                  </Button>
                </div>
              </div>
            )}
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
              <div>
                <Label htmlFor="reagentName">試薬名</Label>
                <Input
                  id="reagentName"
                  {...register("reagentName", { required: true, onBlur: handleReagentNameBlur })}
                />
              </div>
              <div>
                <Label htmlFor="specification">規格</Label>
                <Input id="specification" {...register("specification", { required: true })} />
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
        {/* 登録完了時は「次へ」ボタンを表示 */}
        {registrationComplete && (
          <div className="mt-4">
            <Button onClick={handleNext} variant="outline" className="w-full">
              次へ
            </Button>
          </div>
        )}
        {/* デバッグログ表示エリア（CSV読み込み内容は除外） */}
        {debugLogs.length > 0 && (
          <div className="mt-4 p-2 bg-gray-100 border rounded">
            <h2 className="font-bold mb-2">デバッグログ</h2>
            <pre className="text-xs whitespace-pre-wrap">
              {debugLogs.filter((log) => !log.includes("商品CSV読み込み完了")).join("\n")}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
