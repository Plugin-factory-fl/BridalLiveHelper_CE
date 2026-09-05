/**
 * Render current `drawLabel` layouts to `public/tags/*.png` so the Labels tab
 * preview matches printed Avery 5160 tags.
 *
 * Usage: node scripts/preview-tag-layouts.mjs
 */
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import * as esbuild from 'esbuild'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const LABEL_W_IN = 2.625
const LABEL_H_IN = 1
const IN_TO_PT = 72
const PREVIEW_LONG_EDGE = 1200

const WHITE = rgb(1, 1, 1)

/** Representative boutique samples — chosen to show each drawer’s current fields. */
const SAMPLES = [
  {
    file: 'dress.png',
    original: 'Dress.png',
    payload: {
      itemNumber: '49154',
      style: '4554',
      itemName: '4554',
      description: '4554 ivory lace A-line gown, chapel train',
      vendor: 'PRIVRA1',
      department: 'Dress',
      size: '12',
      color: 'Ivory',
      price: '$629.99',
      msrp: '$699.99',
      salePrice: '$629.99',
      variantColors: [],
      availableSizes: [],
      locationCode: 'PLM',
      barcodeValue: '49154',
      styleLayoutId: 'dress-classic',
    },
  },
  {
    file: 'shoes.png',
    original: 'Shoes.png',
    payload: {
      itemNumber: '328179',
      style: 'Annie',
      itemName: 'Badgley Mischka Annie',
      description: 'Colors: Ivory | Sizes: 6–11',
      vendor: 'BM',
      department: 'Shoes',
      size: '7.5',
      color: 'Ivory',
      price: '$72.00',
      msrp: '$89.99',
      salePrice: '$72.00',
      variantColors: [],
      availableSizes: [],
      locationCode: 'PLM',
      barcodeValue: '328179',
      styleLayoutId: 'shoes-tag',
    },
  },
  {
    file: 'shoes-stock.png',
    original: 'Shoes Stock.png',
    payload: {
      itemNumber: '328179',
      style: 'Annie',
      itemName: 'Badgley Mischka Annie',
      description: 'Colors: Ivory | Sizes: 6–11',
      vendor: 'BM',
      department: 'Shoes',
      size: '7.5',
      color: 'Ivory',
      price: '$72.00',
      msrp: '$89.99',
      salePrice: '$72.00',
      variantColors: [],
      availableSizes: [],
      locationCode: 'PLM',
      barcodeValue: '328179',
      styleLayoutId: 'shoes-stock',
    },
  },
  {
    file: 'jewelry.png',
    original: 'Jewelry.png',
    payload: {
      itemNumber: '88210',
      style: 'Pearl drop',
      itemName: 'Pearl drop earrings',
      description: '',
      vendor: 'JW',
      department: 'Jewelry',
      size: '—',
      color: 'Ivory',
      price: '$36.00',
      msrp: '$48.00',
      salePrice: '$36.00',
      variantColors: [],
      availableSizes: [],
      locationCode: 'PK',
      barcodeValue: '88210',
      styleLayoutId: 'jewelry-tag',
    },
  },
]

async function bundleDrawLabel(outFile) {
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: ['src/labels/draw-label.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: outFile,
    external: ['pdf-lib'],
    define: {
      'import.meta.env': '{}',
    },
  })
}

function rasterizePdf(pdfPath, pngPath) {
  const outDir = dirname(pngPath)
  mkdirSync(outDir, { recursive: true })
  execFileSync('qlmanage', ['-t', '-s', String(PREVIEW_LONG_EDGE), '-o', outDir, pdfPath], {
    stdio: 'pipe',
  })
  const generated = join(outDir, `${pdfPath.split('/').pop()}.png`)
  copyFileSync(generated, pngPath)
}

async function renderSample(drawLabel, sample, workDir) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([LABEL_W_IN * IN_TO_PT, LABEL_H_IN * IN_TO_PT])
  page.drawRectangle({
    x: 0,
    y: 0,
    width: LABEL_W_IN * IN_TO_PT,
    height: LABEL_H_IN * IN_TO_PT,
    color: WHITE,
  })
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
  drawLabel(
    page,
    sample.payload,
    { xIn: 0, yIn: 0, widthIn: LABEL_W_IN, heightIn: LABEL_H_IN },
    fonts,
  )

  const pdfPath = join(workDir, sample.file.replace(/\.png$/, '.pdf'))
  const pngPath = join(workDir, sample.file)
  writeFileSync(pdfPath, await doc.save())
  rasterizePdf(pdfPath, pngPath)

  const publicPath = join(root, 'public/tags', sample.file)
  copyFileSync(pngPath, publicPath)

  const originalPath = join(root, 'tags', sample.original)
  copyFileSync(pngPath, originalPath)
  console.log(`wrote public/tags/${sample.file} and tags/${sample.original}`)
}

const workDir = join(root, '.tmp-preview-tags')
mkdirSync(workDir, { recursive: true })
const bundlePath = join(workDir, 'draw-label.mjs')
await bundleDrawLabel(bundlePath)
const { drawLabel } = await import(pathToFileURL(bundlePath).href)

mkdirSync(join(root, 'public/tags'), { recursive: true })
mkdirSync(join(root, 'tags'), { recursive: true })

for (const sample of SAMPLES) {
  await renderSample(drawLabel, sample, workDir)
}
