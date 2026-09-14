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
      itemNumber: '40410',
      style: '40410',
      itemName: '40410',
      description: 'Deep Green, Mauve, Wine',
      vendor: 'PRIVRA1',
      department: 'Dress',
      size: '16',
      color: 'Wine',
      price: '$449.00',
      msrp: '$526.00',
      salePrice: '$449.00',
      variantColors: [],
      availableSizes: [],
      locationCode: 'PK',
      barcodeValue: '40410',
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
      itemNumber: '41970',
      style: 'Celina-16',
      itemName: 'Celina-16',
      description: 'Colors: Red | Sizes: 6–11',
      vendor: 'BM',
      department: 'Shoes',
      size: '6.5',
      color: 'Red',
      price: '$69.99',
      msrp: '$89.99',
      salePrice: '$69.99',
      variantColors: [],
      availableSizes: [],
      locationCode: 'PK',
      barcodeValue: '41970',
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

async function bundlePreviewModules(outFile) {
  await esbuild.build({
    absWorkingDir: root,
    stdin: {
      contents: `
        export { drawLabel } from './src/labels/draw-label.ts'
        export { AVERY_5160 } from './src/labels/templates.ts'
        export { slotDrawBox } from './src/labels/layout.ts'
      `,
      resolveDir: root,
      sourcefile: 'preview-entry.ts',
    },
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

async function renderSample(drawLabel, AVERY_5160, sample, workDir) {
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
    {
      xIn: AVERY_5160.contentInsetXIn,
      yIn: AVERY_5160.contentInsetBottomIn,
      widthIn: LABEL_W_IN - AVERY_5160.contentInsetXIn * 2,
      heightIn: LABEL_H_IN - AVERY_5160.contentInsetTopIn - AVERY_5160.contentInsetBottomIn,
    },
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
  if (sample.file === 'shoes-stock.png') {
    copyFileSync(pdfPath, join(root, 'tags', 'shoes-stock-sample.pdf'))
    console.log('wrote tags/shoes-stock-sample.pdf')
  }
  if (sample.file === 'dress.png') {
    copyFileSync(pdfPath, join(root, 'tags', 'original-price-sample.pdf'))
    console.log('wrote tags/original-price-sample.pdf')
  }
  console.log(`wrote public/tags/${sample.file} and tags/${sample.original}`)
}

async function renderSampleSheet(drawLabel, AVERY_5160, slotDrawBox, workDir) {
  const doc = await PDFDocument.create()
  const pageWidth = AVERY_5160.pageWidthIn * IN_TO_PT
  const pageHeight = AVERY_5160.pageHeightIn * IN_TO_PT
  const page = doc.addPage([pageWidth, pageHeight])
  page.setMediaBox(0, 0, pageWidth, pageHeight)
  page.setCropBox(0, 0, pageWidth, pageHeight)
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  }

  const dress = SAMPLES.find((sample) => sample.file === 'dress.png')
  const shoesStock = SAMPLES.find((sample) => sample.file === 'shoes-stock.png')
  const jewelry = SAMPLES.find((sample) => sample.file === 'jewelry.png')
  const sheetLabels = [
    shoesStock.payload,
    shoesStock.payload,
    dress.payload,
    shoesStock.payload,
    dress.payload,
    jewelry.payload,
  ]

  for (let i = 0; i < sheetLabels.length; i++) {
    drawLabel(page, sheetLabels[i], slotDrawBox(AVERY_5160, i), fonts)
  }

  const pdfPath = join(workDir, 'avery-5160-sample.pdf')
  writeFileSync(pdfPath, await doc.save())
  copyFileSync(pdfPath, join(root, 'tags', 'avery-5160-sample.pdf'))
  console.log('wrote tags/avery-5160-sample.pdf (print at 100% on Avery 5160 / 6240)')
}

const workDir = join(root, '.tmp-preview-tags')
mkdirSync(workDir, { recursive: true })
const bundlePath = join(workDir, 'draw-label.mjs')
await bundlePreviewModules(bundlePath)
const { drawLabel, AVERY_5160, slotDrawBox } = await import(pathToFileURL(bundlePath).href)

mkdirSync(join(root, 'public/tags'), { recursive: true })
mkdirSync(join(root, 'tags'), { recursive: true })

for (const sample of SAMPLES) {
  await renderSample(drawLabel, AVERY_5160, sample, workDir)
}

await renderSampleSheet(drawLabel, AVERY_5160, slotDrawBox, workDir)
