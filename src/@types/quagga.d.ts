// src/@types/quagga.d.ts
declare module "quagga" {
    export interface QuaggaConfig {
      inputStream: {
        name: string;
        type: string;
        target: HTMLElement;
        constraints: {
          width: number | { min?: number; ideal?: number; max?: number };
          height: number | { min?: number; ideal?: number; max?: number };
          facingMode: string;
          aspectRatio?: { min: number; max: number };
        };
      };
      locator?: {
        patchSize: string;
        halfSample: boolean;
      };
      numOfWorkers?: number;
      frequency?: number;
      decoder: {
        readers: string[];
      };
      locate: boolean;
    }
  
    export interface CodeResult {
      code: string;
    }
  
    export interface QuaggaResult {
      codeResult: CodeResult;
    }
  
    export interface QuaggaStatic {
      init(config: QuaggaConfig, callback: (err: any) => void): void;
      start(): void;
      stop(): void;
      onDetected(callback: (result: QuaggaResult) => void): void;
      onProcessed(callback: (result: any) => void): void;
      decodeSingle(
        config: QuaggaConfig & { src: string },
        callback: (result: QuaggaResult | null) => void
      ): void;
      reset(): void;
      CameraAccess: {
        getActiveTrack(): MediaStreamTrack | null;
        enumerateVideoDevices(): Promise<MediaDeviceInfo[]>;
      };
    }
  
    const Quagga: QuaggaStatic;
    export default Quagga;
  }
  