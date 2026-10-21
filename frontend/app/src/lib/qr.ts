/** QR codes for the public link: an SVG path for the screen and a PNG for printing. */
import qrcode from 'qrcode-generator';

export interface QrMatrix {
  size: number;
  isDark: (row: number, col: number) => boolean;
}

export function qrMatrix(text: string): QrMatrix {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return { size: qr.getModuleCount(), isDark: (r, c) => qr.isDark(r, c) };
}

/** One SVG path (`viewBox="0 0 size size"`) with every dark module. */
export function qrPath(matrix: QrMatrix): string {
  let d = '';
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (matrix.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
  }
  return d;
}

/** Downloads a print-quality PNG (white background, quiet zone, the link written below). */
export async function downloadQrPng(text: string, label: string, fileName: string): Promise<void> {
  const matrix = qrMatrix(text);
  const cell = Math.floor(880 / matrix.size);
  const margin = cell * 4;
  const qrSize = matrix.size * cell;
  const width = qrSize + margin * 2;
  const height = width + 90;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#15241D';
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (matrix.isDark(r, c)) ctx.fillRect(margin + c * cell, margin + r * cell, cell, cell);
    }
  }
  ctx.fillStyle = '#0B6E4F';
  ctx.font = '700 40px Figtree, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, width / 2, width + 40);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
