/** Rasterizes the displayed QR, including its quiet zone, and downloads a PNG. */
export async function downloadQrCode(
  svg: SVGSVGElement | null | undefined,
  filename: string
): Promise<void> {
  if (!svg) throw new Error("QR code is not ready");

  // Use an integer number of pixels per module so the PNG has crisp edges.
  const modules = svg.viewBox.baseVal.width;
  if (!Number.isFinite(modules) || modules <= 0) throw new Error("QR code has invalid dimensions");
  const size = modules * Math.max(1, Math.ceil(512 / modules));
  const source = svg.cloneNode(true) as SVGSVGElement;
  source.setAttribute("width", String(size));
  source.setAttribute("height", String(size));
  source.removeAttribute("class");
  source.removeAttribute("style");
  const svgUrl = URL.createObjectURL(new Blob(
    [new XMLSerializer().serializeToString(source)],
    { type: "image/svg+xml;charset=utf-8" }
  ));

  let png: Blob;
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("QR image could not be loaded"));
      image.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG encoding is unavailable");
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);
    png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob && blob.size > 0) resolve(blob);
        else reject(new Error("QR code could not be encoded as PNG"));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }

  const pngUrl = URL.createObjectURL(png);
  const link = document.createElement("a");
  try {
    link.href = pngUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Give the browser time to consume the object URL after the click.
    setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
  }
}
