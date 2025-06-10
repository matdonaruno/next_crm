'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  Suspense,
  ChangeEvent,
} from 'react';
import {
  useForm,
  SubmitHandler,
} from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Papa from 'papaparse';
import { useRouter, useSearchParams } from 'next/navigation';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import BarcodeScanner from '@/components/BarcodeScanner';
import { AppHeader } from '@/components/ui/app-header';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import supabase from '@/lib/supabaseBrowser';
import { getJstTimestamp, formatJSTTime } from '@/lib/utils';
import type { Database } from '@/types/supabase';

/* ------------------------------------------------------------------ */
/*                               型定義                               */
/* ------------------------------------------------------------------ */

/** フォームバリデーション schema */
const reagentSchema = z.object({
  department: z.string().min(1, '部署は必須です'),
  reagentName: z.string().min(1, '試薬名は必須です'),
  specification: z.string().optional(),
  unit: z.string().optional(),
  lotNo: z.string().min(1, 'ロット番号は必須です'),
  expirationDate: z.string().min(1, '有効期限は必須です'),
  janCode: z.string().optional(),
});

type FormValues = z.infer<typeof reagentSchema>;

interface Product {
  code: string;
  name: string;
  specification: string;
  unit: string;
}

/* ------------------------------------------------------------------ */
/*                       ルートコンポーネント                         */
/* ------------------------------------------------------------------ */

export default function ReagentRegistration() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ReagentRegistrationContent />
    </Suspense>
  );
}

/* ------------------------------------------------------------------ */
/*                メイン（フォーム＋バーコードなど）                   */
/* ------------------------------------------------------------------ */

function ReagentRegistrationContent() {
  /* ------------ 認証 / Supabase ------------ */
  const { user, profile, loading: authLoading } = useAuth();

  /* ---------------- ルータ ----------------- */
  const router = useRouter();
  const searchParams = useSearchParams();
  const departmentNameFromURL = searchParams?.get('department') ?? '';
  const departmentIdFromURL = searchParams?.get('departmentId') ?? '';

  /* ------------- React-Hook-Form ----------- */
  const {
    register,
    setValue,
    reset,
    formState: { errors, isSubmitting },
    handleSubmit,
  } = useForm<FormValues>({
    resolver: zodResolver(reagentSchema),
    defaultValues: {
      department: departmentIdFromURL || '',
    },
  });

  /* --------------- Local state ------------- */
  const [showCamera, setShowCamera] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [facilityName, setFacilityName] = useState<string>('');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const { toast } = useToast();

  /* ------------ utils ------------- */
  const addDebug = useCallback(
    (msg: string) =>
      setDebugLogs((prev) => [
        ...prev,
        `${formatJSTTime(new Date())}: ${msg}`,
      ]),
    []
  );

  /* ------------------------------------------------------------------ */
  /*                        ユーザー / 施設情報設定                      */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    addDebug(`User and facility info effect - user: ${!!user}, profile: ${!!profile}`);
    
    if (!user || !profile) {
      addDebug('User or profile not available for info setup');
      return;
    }

    addDebug(`Setting user info for: ${user.id}`);
    addDebug(`Profile data: ${JSON.stringify(profile)}`);

    /* ユーザー表示名を決定 */
    const userName = (profile.fullname as string | null | undefined) ??
      user.email ??
      user.id;
    
    addDebug(`Setting user name: ${userName}`);
    setCurrentUserName(userName);

    /* 施設名取得 */
    if (profile.facility_id) {
      addDebug(`Fetching facility info for: ${profile.facility_id}`);
      
      const fetchFacility = async () => {
        try {
          const { data: fac, error } = await supabase
            .from('facilities')
            .select('name')
            .eq('id', profile.facility_id as string)
            .single();

          if (error) {
            addDebug(`Facility fetch error: ${JSON.stringify(error)}`);
          } else {
            addDebug(`Facility data: ${JSON.stringify(fac)}`);
            const facilityName = fac?.name ?? '';
            addDebug(`Setting facility name: ${facilityName}`);
            setFacilityName(facilityName);
          }
        } catch (err) {
          addDebug(`Facility fetch exception: ${err}`);
        }
      };
      
      fetchFacility();
    } else {
      addDebug('No facility_id in profile');
    }
  }, [user, profile, addDebug]);

  /* ------------------------------------------------------------------ */
  /*                         初期ロード副作用                           */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    addDebug(`useEffect triggered - authLoading: ${authLoading}, user: ${!!user}, profile: ${!!profile}, departmentId: ${departmentIdFromURL}`);
    
    // departmentIdがない場合は/departにリダイレクト
    if (!departmentIdFromURL) {
      addDebug('No departmentId, redirecting to /depart');
      router.push('/depart');
      return;
    }

    if (!authLoading && user && profile) {
      addDebug('Auth loaded, initializing camera');

      /* カメラインスタンスの確実な初期化 */
      setShowCamera(false);
      const t = setTimeout(() => setShowCamera(true), 500);
      return () => clearTimeout(t);
    } else {
      addDebug(`Waiting for auth - authLoading: ${authLoading}, user: ${!!user}, profile: ${!!profile}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, profile, departmentIdFromURL]);

  /* ------------------------------------------------------------------ */
  /*                       商品マスター CSV 読み込み                     */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const ctrl = new AbortController();

    (async () => {
      try {
        const res = await fetch('/products.csv', {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error('CSV fetch failed');
        const csvText = await res.text();

        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: ({ data }) => {
            addDebug(`Raw CSV data length: ${data.length}`);
            
            const parsed: Product[] = (data as any[])
              .filter((r) => r.code && r.name)
              .map((r) => ({
                code: r.code,
                name: r.name,
                specification: r.specification ?? '',
                unit: r.unit ?? '',
              }));
            
            addDebug(`Parsed products count: ${parsed.length}`);
            if (parsed.length > 0) {
              addDebug(`First product: ${JSON.stringify(parsed[0])}`);
            }
            
            setProducts(parsed);
          },
        });
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        addDebug(`CSV error: ${(e as Error).message}`);
      }
    })();

    return () => ctrl.abort();
  }, [addDebug]);


  /* ------------------------------------------------------------------ */
  /*                     補助関数：GS1-128バーコードパース                */
  /* ------------------------------------------------------------------ */
  const parseGS1Barcode = useCallback((barcode: string) => {
    const result: {
      gtin?: string;
      lotNumber?: string;
      expirationDate?: string;
    } = {};

    let index = 0;
    
    while (index < barcode.length) {
      // Application Identifier (AI) を読み取り
      const ai = barcode.substring(index, index + 2);
      
      switch (ai) {
        case '01': // GTIN (14桁)
          result.gtin = barcode.substring(index + 2, index + 16);
          index += 16;
          break;
          
        case '17': // 有効期限 (YYMMDD)
          const dateStr = barcode.substring(index + 2, index + 8);
          if (dateStr.length === 6) {
            const year = parseInt(dateStr.substring(0, 2)) + 2000;
            const month = dateStr.substring(2, 4);
            const day = dateStr.substring(4, 6);
            result.expirationDate = `${year}-${month}-${day}`;
          }
          index += 8;
          break;
          
        case '10': // バッチ/ロット番号 (可変長)
          // 次のAIまたは文字列の終端まで読み取り
          let nextAiIndex = index + 2;
          while (nextAiIndex < barcode.length) {
            const nextAi = barcode.substring(nextAiIndex, nextAiIndex + 2);
            if (['01', '17', '10', '11', '15', '21'].includes(nextAi)) {
              break;
            }
            nextAiIndex++;
          }
          result.lotNumber = barcode.substring(index + 2, nextAiIndex);
          index = nextAiIndex;
          break;
          
        default:
          // 不明なAI、スキップ
          index += 2;
          break;
      }
    }
    
    return result;
  }, []);

  /* ------------------------------------------------------------------ */
  /*                     補助関数：商品マスターで補完                   */
  /* ------------------------------------------------------------------ */
  const fillFromProduct = useCallback(
    (code: string) => {
      addDebug(`Searching for product with code: ${code}`);
      addDebug(`Available products count: ${products.length}`);
      
      // 最初の5件の商品コードをログ出力
      if (products.length > 0) {
        addDebug(`Sample product codes: ${products.slice(0, 5).map(p => p.code).join(', ')}`);
      }
      
      // 完全一致で検索
      let product = products.find((p) => p.code === code);
      
      // 完全一致しない場合、部分一致で検索
      if (!product) {
        addDebug(`No exact match found, trying partial match...`);
        product = products.find((p) => 
          code.includes(p.code) || p.code.includes(code)
        );
      }
      
      // 先頭からの一致も試行
      if (!product) {
        addDebug(`No partial match found, trying prefix match...`);
        product = products.find((p) => 
          code.startsWith(p.code) || p.code.startsWith(code)
        );
      }
      
      if (!product) {
        addDebug(`No product found for code: ${code}`);
        return;
      }
      
      addDebug(`Found product: ${product.name}`);
      setValue('reagentName', product.name, { shouldValidate: true });
      setValue(
        'specification',
        product.specification ?? '',
        { shouldValidate: false }
      );
      setValue('unit', product.unit ?? '', { shouldValidate: false });
    },
    [products, setValue, addDebug]
  );

  /* ------------------------------------------------------------------ */
  /*                      バーコード検出コールバック                     */
  /* ------------------------------------------------------------------ */
  const handleBarcodeDetected = useCallback(
    (data: string) => {
      addDebug(`Detected: ${data}`);
      setValue('janCode', data, { shouldValidate: false });
      
      // GS1-128バーコードの場合、パースして情報を取得
      if (data.length > 14 && /^01\d{14}/.test(data)) {
        addDebug(`GS1-128 barcode detected, parsing...`);
        const parsed = parseGS1Barcode(data);
        addDebug(`Parsed data: ${JSON.stringify(parsed)}`);
        
        // ロット番号を設定
        if (parsed.lotNumber) {
          addDebug(`Setting lot number: ${parsed.lotNumber}`);
          setValue('lotNo', parsed.lotNumber, { shouldValidate: true });
        }
        
        // 有効期限を設定
        if (parsed.expirationDate) {
          addDebug(`Setting expiration date: ${parsed.expirationDate}`);
          setValue('expirationDate', parsed.expirationDate, { shouldValidate: true });
        }
        
        // GTINで商品マスターを検索
        if (parsed.gtin) {
          addDebug(`Searching product by GTIN: ${parsed.gtin}`);
          fillFromProduct(parsed.gtin);
        }
      } else {
        // 通常のバーコードの場合
        fillFromProduct(data);
      }
    },
    [addDebug, setValue, fillFromProduct, parseGS1Barcode]
  );

  const handleScanError = (msg: string) => setErrorMessage(msg);

  /* ------------------------------------------------------------------ */
  /*                         JAN 手入力 blur                            */
  /* ------------------------------------------------------------------ */
  const handleJanBlur = (e: ChangeEvent<HTMLInputElement>) => {
    const code = e.target.value.trim();
    if (!code) return;
    fillFromProduct(code);
  };

  /* ------------------------------------------------------------------ */
  /*                       フォーム送信（Supabase）                      */
  /* ------------------------------------------------------------------ */
  const onSubmit: SubmitHandler<FormValues> = async (vals) => {
    try {
      const {
        department,
        reagentName,
        specification,
        unit,
        lotNo,
        expirationDate,
        janCode,
      } = vals;

      if (!user || !profile?.facility_id) {
        throw new Error('認証情報または施設IDが取得できません');
      }

      /* 挿入データ構築 */
      // departmentIdFromURLを使用（必須パラメータのため必ず存在する）
      const insertData: Database['public']['Tables']['reagents']['Insert'] =
        {
          department: departmentIdFromURL,
          name: reagentName,
          specification: specification || null,
          unit: unit || null,
          lotNo,
          expirationDate,
          registrationDate: getJstTimestamp(),
          registeredBy: user.id,
          used: false,
          facility_id: profile.facility_id as string,
          jan_code: janCode ?? null,
        };

      const { error: insertErr } = await supabase
        .from('reagents')
        .insert(insertData);

      if (insertErr) throw insertErr;

      toast({
        title: '登録完了',
        description: '試薬を登録しました',
      });
      reset();
      router.push(`/reagent_dash?departmentId=${departmentIdFromURL}&department=${encodeURIComponent(departmentNameFromURL)}`);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : '登録に失敗しました';
      setErrorMessage(msg);
      toast({
        title: 'エラー',
        description: msg,
        variant: 'destructive',
      });
    }
  };

  /* ------------------------------------------------------------------ */
  /*                              JSX                                   */
  /* ------------------------------------------------------------------ */
  return (
    <TooltipProvider>
      <div className="min-h-screen flex flex-col bg-white">
        <AppHeader
          showBackButton
          title="Clinical reagent manager"
        />

        {/* ------------- メイン ------------ */}
        <div className="flex-grow px-4 py-8">
          <div className="max-w-4xl mx-auto">
            {/* ユーザー / 施設情報 */}
            <Card className="mb-6">
              <CardContent className="py-4">
                <p>ユーザー: {currentUserName}</p>
                <p>施設: {facilityName}</p>
              </CardContent>
            </Card>

            {/* スキャナー */}
            {showCamera && (
              <BarcodeScanner
                onBarcodeDetected={handleBarcodeDetected}
                onError={handleScanError}
                onClose={() => setShowCamera(false)}
              />
            )}

            {/* カメラ切替ボタン */}
            <div className="text-center my-4">
              <Button
                variant="outline"
                onClick={() => setShowCamera((v) => !v)}
              >
                {showCamera ? 'カメラを閉じる' : 'カメラを再起動'}
              </Button>
            </div>

            {/* エラー表示 */}
            {errorMessage && (
              <div className="bg-red-50 text-red-700 p-3 mb-4 rounded">
                {errorMessage}
              </div>
            )}

            {/* ---------------- フォーム ---------------- */}
            <Card>
              <CardHeader>
                <CardTitle>試薬情報入力</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={handleSubmit(onSubmit)}
                  className="space-y-6"
                >
                  {/* 部署 */}
                  <div>
                    <Label>
                      部署<span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={departmentNameFromURL}
                      readOnly
                    />
                    <input
                      type="hidden"
                      {...register('department')}
                      value={departmentIdFromURL}
                    />
                    {errors.department && (
                      <p className="text-sm text-red-600 mt-1">
                        {errors.department.message}
                      </p>
                    )}
                  </div>

                  {/* JAN */}
                  <div>
                    <Label>JANコード</Label>
                    <Input
                      {...register('janCode')}
                      onBlur={handleJanBlur}
                    />
                  </div>

                  {/* 試薬名 */}
                  <div>
                    <Label>
                      試薬名<span className="text-red-500">*</span>
                    </Label>
                    <Input {...register('reagentName')} />
                    {errors.reagentName && (
                      <p className="text-sm text-red-600 mt-1">
                        {errors.reagentName.message}
                      </p>
                    )}
                  </div>

                  {/* 規格 */}
                  <div>
                    <Label>規格</Label>
                    <Input {...register('specification')} />
                  </div>

                  {/* 単位 */}
                  <div>
                    <Label>単位</Label>
                    <Input {...register('unit')} />
                  </div>

                  {/* ロット */}
                  <div>
                    <Label>
                      ロット番号
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input {...register('lotNo')} />
                    {errors.lotNo && (
                      <p className="text-sm text-red-600 mt-1">
                        {errors.lotNo.message}
                      </p>
                    )}
                  </div>

                  {/* 有効期限 */}
                  <div>
                    <Label>
                      有効期限
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="date"
                      {...register('expirationDate')}
                    />
                    {errors.expirationDate && (
                      <p className="text-sm text-red-600 mt-1">
                        {errors.expirationDate.message}
                      </p>
                    )}
                  </div>

                  {/* 送信 */}
                  <div className="pt-4">
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full"
                    >
                      {isSubmitting ? '登録中...' : '登録する'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Debug */}
            {process.env.NODE_ENV === 'development' && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Debug Logs</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs whitespace-pre-wrap">
                    {debugLogs.join('\n')}
                  </pre>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ */
/*                            Loader                                  */
/* ------------------------------------------------------------------ */
function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      Loading...
    </div>
  );
}
