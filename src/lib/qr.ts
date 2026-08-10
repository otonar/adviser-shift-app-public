import qrcode from 'qrcode-generator';

// URL から QR コードを作る。
//
// 画像ファイルを持たずにその場で作る狙いは、URL を書き換えたときに
// QR だけ古いまま取り残される事故を防ぐこと（リンク集の URL は運用中に変わる）。
//
// ライブラリの createSvgTag() は SVG の文字列を返すが、それを描画するには
// dangerouslySetInnerHTML が要るので使わない。代わりに path の d 属性だけを
// 組み立てて返し、呼び出し側は普通の JSX で <path d={...} /> を描く。

/** QR の 1 マスを 1×1 の矩形として d 属性にしたもの。 */
export type QrPath = {
  /** <svg viewBox={`0 0 ${size} ${size}`}> に渡す一辺のマス数（余白込み）。 */
  size: number;
  /** <path d={d} /> にそのまま渡す文字列。 */
  d: string;
};

// QR の周囲に必要な静穏帯（クワイエットゾーン）。規格上は 4 マス以上。
const MARGIN = 4;

/**
 * 文字列（URL）を QR の SVG パスに変換する。
 *
 * 誤り訂正レベルは 'M'（約15%まで復元可能）。印刷物ではなく画面に出す前提なので、
 * 汚れ・かすれを見込んだ高いレベルは不要で、そのぶんマス目が粗く＝読み取りやすくなる。
 */
export function qrPath(text: string): QrPath {
  // 第1引数 0 は「必要な大きさを自動で決める」の意味。
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const parts: string[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!qr.isDark(row, col)) continue;
      // 1マス＝1×1 の正方形。塗りつぶしは呼び出し側の fill に任せる。
      parts.push(`M${col + MARGIN} ${row + MARGIN}h1v1h-1z`);
    }
  }

  return { size: count + MARGIN * 2, d: parts.join('') };
}
