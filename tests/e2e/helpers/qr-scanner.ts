import type { Page } from "@playwright/test";

// The browser's native scanner is independent of qrcode.react's encoder.
// Not all Chromium platforms provide QR detection; callers explicitly skip there.
interface QrDetectorConstructor {
  new (options: { formats: string[] }): {
    detect(source: HTMLImageElement): Promise<{ rawValue: string }[]>;
  };
  getSupportedFormats(): Promise<string[]>;
}

export async function supportsQrScanner(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const Detector = (globalThis as unknown as { BarcodeDetector?: QrDetectorConstructor }).BarcodeDetector;
    return Detector ? (await Detector.getSupportedFormats()).includes("qr_code") : false;
  });
}

export async function scanQrImage(page: Page, dataUrl: string): Promise<string[]> {
  return page.evaluate(async (src) => {
    const Detector = (globalThis as unknown as { BarcodeDetector: QrDetectorConstructor }).BarcodeDetector;
    const image = new Image();
    image.src = src;
    await image.decode();
    const results = await new Detector({ formats: ["qr_code"] }).detect(image);
    return results.map((result) => result.rawValue);
  }, dataUrl);
}
