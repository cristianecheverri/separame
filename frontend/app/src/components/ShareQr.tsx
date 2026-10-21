import { useMemo } from 'react';
import { downloadQrPng, qrMatrix, qrPath } from '../lib/qr';
import { linkLabel } from '../lib/format';
import { cx } from './ui/cx';

/** The 88×88 QR tile from the mockup, drawn from the real public link. */
export function QrTile({ url, className }: { url: string; className?: string }) {
  const { path, size } = useMemo(() => {
    const matrix = qrMatrix(url || 'https://separame.app');
    return { path: qrPath(matrix), size: matrix.size };
  }, [url]);
  return (
    <div className={cx('w-[88px] h-[88px] rounded-[14px] bg-surface p-[10px] box-border shrink-0', className)}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full block" shapeRendering="crispEdges" role="img" aria-label={`Código QR de ${linkLabel(url)}`}>
        <path d={path} fill="#15241D" />
      </svg>
    </div>
  );
}

export function downloadQr(url: string, slug: string) {
  return downloadQrPng(url, linkLabel(url), `separame-qr-${slug}.png`);
}
