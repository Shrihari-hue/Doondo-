/**
 * QR module-matrix builder — shared so multiple features (Score
 * credential, Collect QR) encode a string into a boolean grid the mobile
 * draws as Views, with no QR/SVG library on either side.
 *
 * Uses the battle-tested Kazuhiko Arase encoder bundled with
 * qrcode-terminal (already a transitive dependency) directly.
 */

interface QrInstance {
  addData(data: string): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}
type QrConstructor = new (typeNumber: number, errorCorrectLevel: number) => QrInstance;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCode = require('qrcode-terminal/vendor/QRCode') as QrConstructor;

/** A QR code as a module matrix — the mobile draws it as a grid. */
export interface QrMatrix {
  /** Side length in modules. */
  size: number;
  /** modules[row][col] — true = dark module. */
  modules: boolean[][];
}

/** Encode a string into a QR module matrix (auto version, ECC level M). */
export function buildQrMatrix(text: string): QrMatrix {
  const qr = new QRCode(0, 0); // typeNumber 0 = auto-size; ECC 0 = level M
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  const modules: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) row.push(qr.isDark(r, c));
    modules.push(row);
  }
  return { size, modules };
}
