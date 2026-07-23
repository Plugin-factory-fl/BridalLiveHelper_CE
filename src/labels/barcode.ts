/**
 * Minimal Code 128-B barcode patterns for pdf-lib drawing.
 * Patterns are 11 modules (6 bar/space widths that sum to 11) as digit strings.
 */
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]

const START_B = 104
const STOP = 106

function code128BValues(text: string): number[] {
  const values: number[] = [START_B]
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code < 32 || code > 127) {
      // Fallback: encode as '?'
      values.push(31) // '?'
      continue
    }
    values.push(code - 32)
  }
  let checksum = START_B
  for (let i = 1; i < values.length; i++) {
    checksum += values[i]! * i
  }
  values.push(checksum % 103)
  values.push(STOP)
  return values
}

export type BarcodeDrawOptions = {
  x: number
  y: number
  width: number
  height: number
  /** Draw black bars via callback (pdf-lib rectangles). */
  fillRect: (x: number, y: number, w: number, h: number) => void
}

/** Draw a Code 128-B barcode for `text` into the given box. */
export function drawCode128Barcode(text: string, opts: BarcodeDrawOptions): void {
  const value = text.trim() || '0'
  const codes = code128BValues(value)
  let modules = 0
  const patterns: string[] = []
  for (const code of codes) {
    const pat = CODE128_PATTERNS[code] ?? CODE128_PATTERNS[0]!
    patterns.push(pat)
    for (const d of pat) modules += Number(d)
  }
  // Quiet zone ~10 modules each side
  const quiet = 10
  modules += quiet * 2
  const moduleW = opts.width / modules
  let cursor = opts.x + quiet * moduleW
  let bar = true
  for (const pat of patterns) {
    for (const d of pat) {
      const w = Number(d) * moduleW
      if (bar) {
        opts.fillRect(cursor, opts.y, w, opts.height)
      }
      cursor += w
      bar = !bar
    }
  }
}
