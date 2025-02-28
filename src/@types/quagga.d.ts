declare module 'quagga' {
  interface QuaggaConfig {
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
      patchSize?: string;
      halfSample?: boolean;
    };
    numOfWorkers?: number;
    decoder?: {
      readers: string[];
    };
    locate?: boolean;
  }

  interface CodeResult {
    code: string;
    format: string;
  }

  interface QuaggaResult {
    codeResult?: CodeResult;
  }

  interface QuaggaProcessedResult {
    boxes?: unknown;
    line?: unknown;
  }

  type QuaggaCallback = (err: Error | null) => void;
  type QuaggaDecodeSingleCallback = (result: QuaggaResult | null) => void;
  type QuaggaDetectedCallback = (result: QuaggaResult) => void;
  type QuaggaProcessedCallback = (result: QuaggaProcessedResult | null) => void;

  function init(config: QuaggaConfig, callback: QuaggaCallback): void;
  function start(): void;
  function stop(): void;
  function onDetected(callback: QuaggaDetectedCallback): void;
  function onProcessed(callback: QuaggaProcessedCallback): void;
  function decodeSingle(config: QuaggaConfig & { src: string }, callback: QuaggaDecodeSingleCallback): void;
}

export default Quagga;