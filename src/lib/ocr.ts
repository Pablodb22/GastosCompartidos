/**
 * Preparación de la foto de un ticket para el OCR (solo navegador).
 *
 * Las fotos reales tienen sombras, zonas más oscuras y papel térmico desvaído.
 * Tesseract binariza la imagen con un único umbral para toda la foto, así que
 * una sombra puede borrar media columna de precios. Aquí se «aplana» la luz:
 * cada píxel se divide por el brillo medio de su zona, de modo que el papel
 * queda blanco en todas partes y el texto oscuro.
 */

export type Prep = "stretch" | "flatten" | "binarize";

/** Escala de grises reducida (o ampliada) para que el lado mayor mida `maxSide`. */
function grayscale(bitmap: ImageBitmap, maxSide: number) {
  const scale = Math.min(2, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    gray[j] = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
  }
  return { canvas, ctx, img, gray, w, h };
}

/** Media de cada píxel en una ventana cuadrada (con imagen integral: rápido aunque la ventana sea grande). */
function localMean(gray: Float32Array, w: number, h: number, radius: number) {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const mean = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h, y + radius + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      const sum =
        integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      mean[y * w + x] = sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return mean;
}

export async function prepareImage(file: Blob, prep: Prep = "flatten", maxSide = 1800): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const { canvas, ctx, img, gray, w, h } = grayscale(bitmap, maxSide);
  bitmap.close();
  const out = new Uint8ClampedArray(w * h);

  if (prep === "stretch") {
    let min = 255;
    let max = 0;
    for (const g of gray) {
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const range = Math.max(1, max - min);
    for (let i = 0; i < gray.length; i++) out[i] = ((gray[i] - min) / range) * 255;
  } else {
    // Ventana de ~1/12 del ancho: más grande que una letra, más pequeña que una sombra.
    const radius = Math.max(8, Math.round(Math.min(w, h) / 24));
    const mean = localMean(gray, w, h, radius);
    for (let i = 0; i < gray.length; i++) {
      const ratio = gray[i] / Math.max(1, mean[i]);
      out[i] = prep === "binarize" ? (ratio < 0.85 ? 0 : 255) : Math.min(255, Math.max(0, (ratio - 0.55) * 2.2 * 255));
    }
  }

  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = out[j];
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
