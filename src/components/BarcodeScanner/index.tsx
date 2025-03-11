'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Camera, Image as ImageIcon, RefreshCw } from 'lucide-react';
import styles from './styles.module.css';

// BarcodeDetectorの型定義
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

interface BarcodeScannerProps {
  onBarcodeDetected: (barcode: string, format: string) => void;
  onError?: (error: string) => void;
  onClose?: () => void;
}

export default function BarcodeScanner({ 
  onBarcodeDetected, 
  onError,
  onClose 
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCameraMode, setIsCameraMode] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBarcodeAPISupported, setIsBarcodeAPISupported] = useState(false);

  // Barcode Detector APIのサポートチェック
  useEffect(() => {
    // @ts-expect-error - BarcodeDetector APIの型定義がないため
    if ('BarcodeDetector' in window) {
      setIsBarcodeAPISupported(true);
      console.log('Barcode Detector API is supported');
    } else {
      setIsBarcodeAPISupported(false);
      console.log('Barcode Detector API is not supported');
      setError('このブラウザはBarcodeDetector APIをサポートしていません。Chrome/Edgeの最新版をお試しください。');
      if (onError) onError('このブラウザはBarcodeDetector APIをサポートしていません');
    }
  }, [onError]);

  // カメラの初期化
  const initCamera = useCallback(async () => {
    if (!videoRef.current) return;
    
    try {
      setIsInitializing(true);
      setError(null);
      
      // カメラストリームの取得
      const constraints = {
        video: {
          facingMode: 'environment', // バックカメラを優先
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
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
      
      await videoRef.current.play();
    } catch (err) {
      console.error('カメラ初期化エラー:', err);
      setError('カメラの起動に失敗しました。カメラへのアクセス許可を確認してください。');
      setIsInitializing(false);
      if (onError) onError('カメラの起動に失敗しました');
    }
  }, [onError]);

  // カメラの停止
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

  // コンポーネントのマウント時にカメラを初期化
  useEffect(() => {
    if (isCameraMode) {
      initCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [initCamera, stopCamera, isCameraMode]);

  // バーコードスキャンのループ処理
  useEffect(() => {
    if (!isBarcodeAPISupported || !isScanning || !videoRef.current || !canvasRef.current) return;
    
    let animationFrameId: number;
    let lastDetectionTime = 0;
    const DETECTION_INTERVAL = 200; // 検出間隔（ミリ秒）
    
    const scanBarcode = async (timestamp: number) => {
      if (timestamp - lastDetectionTime > DETECTION_INTERVAL) {
        lastDetectionTime = timestamp;
        
        try {
          // ビデオフレームをキャンバスに描画
          const video = videoRef.current!;
          const canvas = canvasRef.current!;
          const ctx = canvas.getContext('2d')!;
          
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // バーコード検出
          // @ts-expect-error - BarcodeDetector APIの型定義がないため
          const barcodeDetector = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
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
  }, [isBarcodeAPISupported, isScanning, onBarcodeDetected, stopCamera]);

  // 画像ファイルからバーコードをスキャン
  const scanFromImage = async (imageUrl: string) => {
    if (!isBarcodeAPISupported) {
      setError('バーコード検出機能が利用できません');
      return;
    }
    
    try {
      setIsProcessing(true);
      
      // 画像を読み込む
      const img = new Image();
      img.src = imageUrl;
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      
      // 画像をキャンバスに描画
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext('2d')!;
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0, img.width, img.height);
      
      // バーコード検出
      // @ts-expect-error - BarcodeDetector APIの型定義がないため
      const barcodeDetector = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
      const barcodes = await barcodeDetector.detect(canvas);
      
      if (barcodes.length > 0) {
        // 最初に検出されたバーコードを使用
        const barcode = barcodes[0];
        console.log('画像からバーコード検出:', barcode);
        
        // 検出結果をコールバックで返す
        onBarcodeDetected(barcode.rawValue, barcode.format);
      } else {
        setError('バーコードが検出できませんでした');
        if (onError) onError('バーコードが検出できませんでした');
      }
    } catch (err) {
      console.error('画像からのバーコードスキャンエラー:', err);
      setError('画像の処理中にエラーが発生しました');
      if (onError) onError('画像の処理中にエラーが発生しました');
    } finally {
      setIsProcessing(false);
    }
  };

  // 画像ファイル選択ハンドラ
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // ファイルがイメージかチェック
    if (!file.type.startsWith('image/')) {
      setError('画像ファイルを選択してください');
      return;
    }
    
    // ファイルをURLに変換
    const imageUrl = URL.createObjectURL(file);
    setCapturedImage(imageUrl);
    
    // バーコードスキャン
    scanFromImage(imageUrl);
  };

  // 手動でキャプチャ
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
    const imageSrc = canvas.toDataURL('image/jpeg', 1.0);
    setCapturedImage(imageSrc);
    
    // スキャンを一時停止
    setIsScanning(false);
    
    // バーコードスキャン
    scanFromImage(imageSrc);
  };

  // モード切替
  const toggleMode = () => {
    setIsCameraMode(!isCameraMode);
    setCapturedImage(null);
    setError(null);
    
    if (isCameraMode) {
      stopCamera();
    }
  };

  // リセット
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