'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Camera, Image as ImageIcon, RefreshCw, CheckCircle2 } from 'lucide-react';
import styles from './styles.module.css';

// BarcodeDetector APIのpolyfillをインポート
// 注: 実際のデプロイ時には、このURLを適切なCDNに変更するか、パッケージをインストールしてください
const BarcodeDetectorPolyfillScript = 'https://fastly.jsdelivr.net/npm/barcode-detector@2/dist/es/pure.min.js';

// polyfill用の型定義
interface BarcodeDetectorPolyfillModule {
  BarcodeDetector: {
    new(options?: BarcodeDetectorOptions): BarcodeDetector;
  };
}

// polyfillを動的にロードする関数
const loadBarcodeDetectorPolyfill = async () => {
  // すでにBarcodeDetector APIがサポートされている場合は何もしない
  if ('BarcodeDetector' in window) {
    console.log('Native BarcodeDetector API is supported');
    return;
  }

  console.log('Loading BarcodeDetector polyfill...');
  try {
    // ESモジュールとしてpolyfillをインポート
    const polyfillModule = await import(/* webpackIgnore: true */ BarcodeDetectorPolyfillScript) as BarcodeDetectorPolyfillModule;
    // window.BarcodeDetectorにpolyfillを設定
    // @ts-expect-error - TypeScriptの型チェックを無視（実行時には動的に追加される）
    window.BarcodeDetector = polyfillModule.BarcodeDetector;
    console.log('BarcodeDetector polyfill loaded successfully');
  } catch (error) {
    console.error('Failed to load BarcodeDetector polyfill:', error);
  }
};

/**
 * BarcodeDetector API の型定義
 * Web標準のBarcodeDetector APIの型定義がないため、独自に定義
 */
interface BarcodeDetectorOptions {
  formats: string[];
}

interface BarcodeDetectorResult {
  boundingBox: DOMRectReadOnly;
  cornerPoints: { x: number; y: number }[];
  format: string;
  rawValue: string;
}

interface BarcodeDetector {
  detect(image: ImageBitmapSource): Promise<BarcodeDetectorResult[]>;
}

// グローバルなWindow型を拡張してBarcodeDetectorを含める
declare global {
  interface Window {
    BarcodeDetector: {
      new(options?: BarcodeDetectorOptions): BarcodeDetector;
    };
  }
}

// サポートされているバーコードフォーマット
const BARCODE_FORMATS = [
  'aztec',
  'code_128',
  'code_39',
  'code_93',
  'codabar',
  'data_matrix',
  'ean_13',
  'ean_8',
  'itf',
  'pdf417',
  'qr_code',
  'upc_a',
  'upc_e'
];

// カメラ初期化の遅延時間（ミリ秒）
const CAMERA_INIT_DELAY = 500;
// バーコード検出の間隔（ミリ秒）
const DETECTION_INTERVAL = 200;

interface BarcodeScannerProps {
  /** バーコード検出時のコールバック関数 */
  onBarcodeDetected: (barcode: string, format: string) => void;
  /** エラー発生時のコールバック関数 */
  onError?: (error: string) => void;
  /** スキャナーを閉じる際のコールバック関数 */
  onClose?: () => void;
}

// バーコードタイプの定義
type BarcodeType = 'gs1_128' | 'qr_code' | 'gs1_128_vertical' | 'cross';

/**
 * バーコードスキャナーコンポーネント
 * カメラまたは画像ファイルからバーコードを検出する
 */
export default function BarcodeScanner({ 
  onBarcodeDetected, 
  onError,
  onClose 
}: BarcodeScannerProps) {
  // DOM参照
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // 状態管理
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCameraMode, setIsCameraMode] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBarcodeAPISupported, setIsBarcodeAPISupported] = useState(false);
  const [barcodeType, setBarcodeType] = useState<BarcodeType>('gs1_128'); // デフォルトはGS1-128に戻す
  const [detectedBarcode, setDetectedBarcode] = useState<{value: string, format: string} | null>(null);
  const [showCamera, setShowCamera] = useState(true);

  // 現在のバーコードタイプに基づいてフォーマットを選択
  const getSelectedFormats = useCallback(() => {
    switch (barcodeType) {
      case 'gs1_128':
      case 'gs1_128_vertical':
      case 'cross':
        return ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e']; // 一般的な1Dバーコード形式を追加
      case 'qr_code':
        return ['qr_code', 'data_matrix', 'pdf417']; // 2Dバーコード形式を追加
      default:
        return BARCODE_FORMATS;
    }
  }, [barcodeType]);

  /**
   * Barcode Detector APIのサポートチェック
   */
  useEffect(() => {
    // polyfillをロード
    const initBarcodeDetector = async () => {
      try {
        await loadBarcodeDetectorPolyfill();
        
        // polyfillロード後に再度チェック
        if ('BarcodeDetector' in window) {
          setIsBarcodeAPISupported(true);
          console.log('Barcode Detector API is supported (native or polyfill)');
        } else {
          setIsBarcodeAPISupported(false);
          console.log('Barcode Detector API is not supported, even with polyfill');
          const errorMsg = 'このブラウザはBarcodeDetector APIをサポートしていません。Chrome/Edgeの最新版をお試しください。';
          setError(errorMsg);
          if (onError) onError(errorMsg);
        }
      } catch (error) {
        console.error('Error initializing BarcodeDetector:', error);
        setIsBarcodeAPISupported(false);
        const errorMsg = 'バーコード検出機能の初期化に失敗しました。';
        setError(errorMsg);
        if (onError) onError(errorMsg);
      }
    };

    initBarcodeDetector();
  }, [onError]);

  /**
   * カメラの初期化
   */
  const initCamera = useCallback(async () => {
    if (!videoRef.current) return;
    
    try {
      setIsInitializing(true);
      setError(null);
      
      // 既存のストリームがあれば停止
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      
      // 少し遅延を入れてから初期化
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // カメラストリームの取得
      const constraints = {
        video: {
          facingMode: 'environment', // バックカメラを優先
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // コンポーネントがアンマウントされていないか確認
      if (!videoRef.current) {
        // すでにアンマウントされている場合はストリームを停止
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      
      // ビデオ要素の準備
      if (videoRef.current.srcObject) {
        // 既存のストリームがある場合は一旦nullに設定
        videoRef.current.srcObject = null;
        // 少し待機して状態をリセット
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // 新しいストリームを設定
      videoRef.current.srcObject = stream;
      streamRef.current = stream;
      
      // ビデオが読み込まれたら解像度をログに出力
      videoRef.current.onloadedmetadata = () => {
        if (videoRef.current) {
          console.log(`カメラ解像度: ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`);
          setIsInitializing(false);
          setIsScanning(true);
        }
      };
      
      // エラーハンドリングを追加
      videoRef.current.onerror = (e) => {
        console.error('ビデオ要素エラー:', e);
        const errorMsg = 'ビデオの初期化中にエラーが発生しました';
        setError(errorMsg);
        setIsInitializing(false);
        if (onError) onError(errorMsg);
      };
      
      try {
        // 再生前に少し待機
        await new Promise(resolve => setTimeout(resolve, 100));
        await videoRef.current.play();
        console.log('カメラ初期化成功');
      } catch (playErr: any) {
        console.error('ビデオ再生エラー:', playErr);
        
        // AbortErrorの場合は再試行
        if (playErr.name === 'AbortError') {
          console.log('再生が中断されました。再試行します...');
          
          // 再試行前に既存のストリームを確実に停止
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
          }
          
          // より長い遅延を設定して再試行
          setTimeout(async () => {
            if (videoRef.current) {
              try {
                // srcObjectを一旦nullに設定してリセット
                videoRef.current.srcObject = null;
                
                // 少し待機
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // 新しいストリームを再取得
                const newStream = await navigator.mediaDevices.getUserMedia(constraints);
                videoRef.current.srcObject = newStream;
                streamRef.current = newStream;
                
                // 再度少し待機
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // 再生を試行
                await videoRef.current.play();
                console.log('再試行成功');
                setIsInitializing(false);
                setIsScanning(true);
              } catch (retryErr) {
                console.error('再試行エラー:', retryErr);
                const errorMsg = 'カメラの起動に失敗しました。ページを再読み込みしてください。';
                setError(errorMsg);
                setIsInitializing(false);
                if (onError) onError('カメラの起動に失敗しました');
                
                // 確実にストリームを停止
                if (streamRef.current) {
                  streamRef.current.getTracks().forEach(track => track.stop());
                  streamRef.current = null;
                }
              }
            }
          }, 800); // より長い遅延で再試行
        } else {
          throw playErr; // その他のエラーは外側のcatchブロックで処理
        }
      }
    } catch (err) {
      console.error('カメラ初期化エラー:', err);
      const errorMsg = 'カメラの起動に失敗しました。カメラへのアクセス許可を確認してください。';
      setError(errorMsg);
      setIsInitializing(false);
      if (onError) onError('カメラの起動に失敗しました');
      
      // 確実にストリームを停止
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  }, [onError]);

  /**
   * カメラの停止
   */
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsScanning(false);
  }, []);

  /**
   * コンポーネントのマウント時にカメラを初期化
   */
  useEffect(() => {
    let mounted = true;
    let initTimeoutId: NodeJS.Timeout | null = null;
    
    if (isCameraMode) {
      // コンポーネントがマウントされている場合のみ初期化
      const startCamera = async () => {
        // 少し遅延を入れてからカメラを初期化
        initTimeoutId = setTimeout(() => {
          if (mounted) {
            initCamera();
          }
        }, CAMERA_INIT_DELAY);
      };
      
      startCamera();
    }
    
    return () => {
      mounted = false;
      
      // タイムアウトをクリア
      if (initTimeoutId) {
        clearTimeout(initTimeoutId);
      }
      
      // カメラを確実に停止
      stopCamera();
    };
  }, [initCamera, stopCamera, isCameraMode]);

  /**
   * バーコードスキャンのループ処理
   */
  useEffect(() => {
    if (!isBarcodeAPISupported || !isScanning || !videoRef.current || !canvasRef.current) return;
    
    let animationFrameId: number | null = null;
    let lastDetectionTime = 0;
    let isActive = true; // このエフェクトがアクティブかどうかを追跡
    
    /**
     * バーコードスキャン処理
     */
    const scanBarcode = async (timestamp: number) => {
      // このエフェクトが非アクティブになっていたら処理を中止
      if (!isActive) return;
      
      if (timestamp - lastDetectionTime > DETECTION_INTERVAL) {
        lastDetectionTime = timestamp;
        
        try {
          // ビデオ要素とキャンバス要素が存在するか再確認
          if (!videoRef.current || !canvasRef.current || !isActive) return;
          
          // ビデオフレームをキャンバスに描画
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            console.error('キャンバスコンテキストの取得に失敗しました');
            return;
          }
          
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // バーコード検出（選択されたフォーマットのみ）
          const selectedFormats = getSelectedFormats();
          console.log(`スキャン中のバーコードタイプ: ${barcodeType}、フォーマット:`, selectedFormats);
          const barcodeDetector = new window.BarcodeDetector({ formats: selectedFormats });
          const barcodes = await barcodeDetector.detect(canvas);
          
          // 再度アクティブかチェック（非同期処理中にアンマウントされた可能性がある）
          if (!isActive) return;
          
          if (barcodes.length > 0) {
            // 最初に検出されたバーコードを使用
            const barcode = barcodes[0];
            console.log('バーコード検出:', barcode);
            
            // 検出結果を保存
            setDetectedBarcode({
              value: barcode.rawValue,
              format: barcode.format
            });
            
            // カメラを非表示にする
            setShowCamera(false);
            
            // スキャンを停止
            stopCamera();
            
            // 検出結果をコールバックで返す
            onBarcodeDetected(barcode.rawValue, barcode.format);
            return;
          }
        } catch (err) {
          console.error('バーコードスキャンエラー:', err);
        }
      }
      
      // 次のフレームでスキャンを継続（アクティブな場合のみ）
      if (isActive) {
        animationFrameId = requestAnimationFrame(scanBarcode);
      }
    };
    
    // スキャン開始
    animationFrameId = requestAnimationFrame(scanBarcode);
    
    // クリーンアップ
    return () => {
      isActive = false; // このエフェクトを非アクティブにマーク
      
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };
  }, [isBarcodeAPISupported, isScanning, onBarcodeDetected, stopCamera, barcodeType, getSelectedFormats, showCamera]);

  /**
   * 画像ファイルからバーコードをスキャン
   */
  const scanFromImage = async (imageUrl: string) => {
    if (!isBarcodeAPISupported) {
      const errorMsg = 'バーコード検出機能が利用できません';
      setError(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }
    
    try {
      setIsProcessing(true);
      
      // 画像を読み込む
      const img = new Image();
      img.src = imageUrl;
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
      });
      
      // 画像をキャンバスに描画
      const canvas = canvasRef.current;
      if (!canvas) {
        throw new Error('キャンバス要素が見つかりません');
      }
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('キャンバスコンテキストの取得に失敗しました');
      }
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0, img.width, img.height);
      
      // バーコード検出（選択されたフォーマットのみ）
      const selectedFormats = getSelectedFormats();
      console.log(`画像スキャン中のバーコードタイプ: ${barcodeType}、フォーマット:`, selectedFormats);
      const barcodeDetector = new window.BarcodeDetector({ formats: selectedFormats });
      const barcodes = await barcodeDetector.detect(canvas);
      
      if (barcodes.length > 0) {
        // 最初に検出されたバーコードを使用
        const barcode = barcodes[0];
        console.log('画像からバーコード検出:', barcode);
        
        // 検出結果を保存
        setDetectedBarcode({
          value: barcode.rawValue,
          format: barcode.format
        });
        
        // 検出結果をコールバックで返す
        onBarcodeDetected(barcode.rawValue, barcode.format);
      } else {
        const errorMsg = 'バーコードが検出できませんでした';
        setError(errorMsg);
        if (onError) onError(errorMsg);
      }
    } catch (err) {
      console.error('画像からのバーコードスキャンエラー:', err);
      const errorMsg = '画像の処理中にエラーが発生しました';
      setError(errorMsg);
      if (onError) onError(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * 画像ファイル選択ハンドラ
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // ファイルがイメージかチェック
    if (!file.type.startsWith('image/')) {
      const errorMsg = '画像ファイルを選択してください';
      setError(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }
    
    // ファイルをURLに変換
    const imageUrl = URL.createObjectURL(file);
    setCapturedImage(imageUrl);
    
    // バーコードスキャン
    scanFromImage(imageUrl);
  };

  /**
   * 手動でキャプチャ
   */
  const handleCaptureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('キャンバスコンテキストの取得に失敗しました');
      return;
    }
    
    // キャンバスをビデオと同じサイズに設定
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // ビデオフレームをキャンバスに描画
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // キャンバスから画像データを取得
    const imageSrc = canvas.toDataURL('image/jpeg', 1.0);
    setCapturedImage(imageSrc);
    
    // スキャンを一時停止
    setIsScanning(false);
    
    // バーコードスキャン
    scanFromImage(imageSrc);
  };

  /**
   * モード切替（カメラ/画像アップロード）
   */
  const toggleMode = () => {
    setIsCameraMode(!isCameraMode);
    setCapturedImage(null);
    setError(null);
    setDetectedBarcode(null);
    setShowCamera(true);
    
    if (isCameraMode) {
      stopCamera();
    }
  };

  /**
   * リセット処理
   */
  const handleReset = () => {
    setCapturedImage(null);
    setError(null);
    setDetectedBarcode(null);
    setShowCamera(true);
    
    if (isCameraMode) {
      setIsScanning(true);
      initCamera();
    } else {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // バーコードタイプを切り替える関数
  const toggleBarcodeType = () => {
    setBarcodeType(prevType => {
      if (prevType === 'cross') return 'gs1_128';
      if (prevType === 'gs1_128') return 'gs1_128_vertical';
      if (prevType === 'gs1_128_vertical') return 'qr_code';
      return 'cross';
    });
    setError(null);
    
    // リセットして再スキャン
    if (isCameraMode && isScanning) {
      // カメラは継続して使用
      console.log(`バーコードタイプを切り替えました: ${barcodeType}`);
    }
  };

  // バーコードタイプに応じたビューファインダーを表示
  const renderViewfinder = () => {
    if (!isScanning) return null;
    
    switch (barcodeType) {
      case 'cross':
        return (
          <div className={styles.viewfinderCross}>
            <div className={styles.crossHorizontal}></div>
            <div className={styles.crossVertical}></div>
            <div className={styles.centerMarker}></div>
            <div className={`${styles.cornerMarker} ${styles.topLeft}`}></div>
            <div className={`${styles.cornerMarker} ${styles.topRight}`}></div>
            <div className={`${styles.cornerMarker} ${styles.bottomLeft}`}></div>
            <div className={`${styles.cornerMarker} ${styles.bottomRight}`}></div>
          </div>
        );
      case 'gs1_128':
        return (
          <div className={styles.viewfinderHorizontal}>
            <div className={`${styles.cornerMarker} ${styles.topLeft}`}></div>
            <div className={`${styles.cornerMarker} ${styles.topRight}`}></div>
            <div className={`${styles.cornerMarker} ${styles.bottomLeft}`}></div>
            <div className={`${styles.cornerMarker} ${styles.bottomRight}`}></div>
          </div>
        );
      case 'gs1_128_vertical':
        return (
          <div className={styles.viewfinderVertical}>
            <div className={`${styles.cornerMarker} ${styles.topLeft}`}></div>
            <div className={`${styles.cornerMarker} ${styles.topRight}`}></div>
            <div className={`${styles.cornerMarker} ${styles.bottomLeft}`}></div>
            <div className={`${styles.cornerMarker} ${styles.bottomRight}`}></div>
          </div>
        );
      case 'qr_code':
        return <div className={styles.viewfinder} />;
      default:
        return <div className={styles.viewfinder} />;
    }
  };

  // バーコードタイプの表示名を取得
  const getBarcodeTypeName = () => {
    switch (barcodeType) {
      case 'cross':
        return '十字型（縦横両対応）';
      case 'gs1_128':
        return 'GS1-128 横向き';
      case 'gs1_128_vertical':
        return 'GS1-128 縦向き';
      case 'qr_code':
        return 'QRコード';
      default:
        return 'バーコード';
    }
  };

  return (
    <Card className={styles.scannerContainer}>
      <CardContent className={styles.scannerContent}>
        {error && (
          <Alert variant="destructive" className={styles.alert}>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {detectedBarcode ? (
          <div className={styles.detectionResult}>
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
            <h3>バーコード検出成功</h3>
            <p><strong>形式:</strong> {detectedBarcode.format}</p>
            <p><strong>値:</strong> {detectedBarcode.value}</p>
          </div>
        ) : (
          <div className={styles.viewfinderContainer}>
            {isCameraMode && showCamera ? (
              <>
                <video 
                  ref={videoRef} 
                  className={styles.video} 
                  playsInline 
                  muted
                />
                {renderViewfinder()}
              </>
            ) : (
              capturedImage ? (
                <img src={capturedImage} alt="Captured" className={styles.capturedImage} />
              ) : (
                <div className={styles.uploadPlaceholder}>
                  <ImageIcon size={48} />
                  <p>画像を選択してください</p>
                </div>
              )
            )}
            
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>
        )}
        
        <div className={styles.controls}>
          {/* バーコードタイプ切り替えボタン */}
          {!detectedBarcode && (
            <Button 
              variant="outline" 
              onClick={toggleBarcodeType}
              className="mb-2 w-full"
            >
              {getBarcodeTypeName()}モードに設定中
            </Button>
          )}
          
          {isCameraMode && !detectedBarcode ? (
            <>
              <Button 
                onClick={handleCaptureImage} 
                disabled={isInitializing || !isScanning || !isBarcodeAPISupported || !showCamera}
                className={styles.captureButton}
              >
                {isInitializing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera />}
                {isInitializing ? '初期化中...' : '撮影'}
              </Button>
              
              <Button variant="outline" onClick={toggleMode}>
                画像を選択
              </Button>
            </>
          ) : !detectedBarcode ? (
            <>
              <Button 
                onClick={() => fileInputRef.current?.click()} 
                disabled={isProcessing || !isBarcodeAPISupported}
              >
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />}
                画像を選択
              </Button>
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                style={{ display: 'none' }} 
              />
              
              <Button variant="outline" onClick={toggleMode}>
                カメラに切替
              </Button>
            </>
          ) : null}
          
          {(capturedImage || error || detectedBarcode) && (
            <Button variant="outline" onClick={handleReset}>
              <RefreshCw className="mr-2 h-4 w-4" />
              リセット
            </Button>
          )}
          
          {onClose && (
            <Button variant="secondary" onClick={onClose}>
              閉じる
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 