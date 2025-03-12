'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Camera, Image as ImageIcon, RefreshCw } from 'lucide-react';
import styles from './styles.module.css';

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
type BarcodeType = 'gs1_128' | 'qr_code';

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
  const [barcodeType, setBarcodeType] = useState<BarcodeType>('gs1_128'); // デフォルトはGS1-128

  // 現在のバーコードタイプに基づいてフォーマットを選択
  const getSelectedFormats = useCallback(() => {
    switch (barcodeType) {
      case 'gs1_128':
        return ['code_128'];
      case 'qr_code':
        return ['qr_code'];
      default:
        return BARCODE_FORMATS;
    }
  }, [barcodeType]);

  /**
   * Barcode Detector APIのサポートチェック
   */
  useEffect(() => {
    if ('BarcodeDetector' in window) {
      setIsBarcodeAPISupported(true);
      console.log('Barcode Detector API is supported');
    } else {
      setIsBarcodeAPISupported(false);
      console.log('Barcode Detector API is not supported');
      const errorMsg = 'このブラウザはBarcodeDetector APIをサポートしていません。Chrome/Edgeの最新版をお試しください。';
      setError(errorMsg);
      if (onError) onError(errorMsg);
    }
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
        await videoRef.current.play();
        console.log('カメラ初期化成功');
      } catch (playErr: any) {
        console.error('ビデオ再生エラー:', playErr);
        
        // AbortErrorの場合は再試行
        if (playErr.name === 'AbortError') {
          console.log('再生が中断されました。再試行します...');
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.play()
                .then(() => console.log('再試行成功'))
                .catch(retryErr => {
                  console.error('再試行エラー:', retryErr);
                  const errorMsg = 'カメラの起動に失敗しました。ページを再読み込みしてください。';
                  setError(errorMsg);
                  setIsInitializing(false);
                  if (onError) onError('カメラの起動に失敗しました');
                });
            }
          }, 500);
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
    
    if (isCameraMode) {
      // コンポーネントがマウントされている場合のみ初期化
      const startCamera = async () => {
        // 少し遅延を入れてからカメラを初期化
        await new Promise(resolve => setTimeout(resolve, CAMERA_INIT_DELAY));
        if (mounted) {
          initCamera();
        }
      };
      
      startCamera();
    }
    
    return () => {
      mounted = false;
      stopCamera();
    };
  }, [initCamera, stopCamera, isCameraMode]);

  /**
   * バーコードスキャンのループ処理
   */
  useEffect(() => {
    if (!isBarcodeAPISupported || !isScanning || !videoRef.current || !canvasRef.current) return;
    
    let animationFrameId: number;
    let lastDetectionTime = 0;
    
    /**
     * バーコードスキャン処理
     */
    const scanBarcode = async (timestamp: number) => {
      if (timestamp - lastDetectionTime > DETECTION_INTERVAL) {
        lastDetectionTime = timestamp;
        
        try {
          // ビデオフレームをキャンバスに描画
          const video = videoRef.current!;
          const canvas = canvasRef.current!;
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
          
          if (barcodes.length > 0) {
            // 最初に検出されたバーコードを使用
            const barcode = barcodes[0];
            console.log('バーコード検出:', barcode);
            
            // 検出結果をコールバックで返す
            onBarcodeDetected(barcode.rawValue, barcode.format);
            
            // スキャンを停止
            stopCamera();
            return;
          }
        } catch (err) {
          console.error('バーコードスキャンエラー:', err);
        }
      }
      
      // 次のフレームでスキャンを継続
      animationFrameId = requestAnimationFrame(scanBarcode);
    };
    
    // スキャン開始
    animationFrameId = requestAnimationFrame(scanBarcode);
    
    // クリーンアップ
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isBarcodeAPISupported, isScanning, onBarcodeDetected, stopCamera, barcodeType, getSelectedFormats]);

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
    
    if (isCameraMode) {
      setIsScanning(true);
    } else {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // バーコードタイプを切り替える関数
  const toggleBarcodeType = () => {
    setBarcodeType(prevType => prevType === 'gs1_128' ? 'qr_code' : 'gs1_128');
    setError(null);
    
    // リセットして再スキャン
    if (isCameraMode && isScanning) {
      // カメラは継続して使用
      console.log(`バーコードタイプを切り替えました: ${barcodeType === 'gs1_128' ? 'QRコード' : 'GS1-128'}`);
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
        
        <div className={styles.viewfinderContainer}>
          {isCameraMode ? (
            <>
              <video 
                ref={videoRef} 
                className={styles.video} 
                playsInline 
                muted
              />
              {isScanning && <div className={styles.viewfinder} />}
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
        
        <div className={styles.controls}>
          {/* バーコードタイプ切り替えボタン */}
          <Button 
            variant="outline" 
            onClick={toggleBarcodeType}
            className="mb-2 w-full"
          >
            {barcodeType === 'gs1_128' ? 'GS1-128モード' : 'QRコードモード'}に設定中
          </Button>
          
          {isCameraMode ? (
            <>
              <Button 
                onClick={handleCaptureImage} 
                disabled={isInitializing || !isScanning || !isBarcodeAPISupported}
                className={styles.captureButton}
              >
                {isInitializing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera />}
                {isInitializing ? '初期化中...' : '撮影'}
              </Button>
              
              <Button variant="outline" onClick={toggleMode}>
                画像を選択
              </Button>
            </>
          ) : (
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
          )}
          
          {(capturedImage || error) && (
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