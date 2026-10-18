"use client";

import { QRCodeSVG } from "qrcode.react";

interface QrCodeProps {
  value: string;
}

export function QrCode({ value }: QrCodeProps) {
  return (
    <QRCodeSVG
      value={value}
      size={192}
      marginSize={4}
      data-testid="qr-code"
      role="img"
      aria-label={`QR code for ${value}`}
      className="h-48 w-48 rounded-3xl border border-zinc-200 bg-white p-3 shadow-inner dark:border-zinc-800"
    />
  );
}
