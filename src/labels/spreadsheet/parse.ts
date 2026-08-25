import { detectHeaderRow, mapColumns } from './map-columns'
import type { SpreadsheetColumnKey, SpreadsheetInventoryRow, SpreadsheetParseResult } from './types'

function cellString(row: unknown[], index: number | undefined): string {
  if (index == null) return ''
  const value = row[index]
  if (value == null || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value)
  }
  return String(value).replace(/\s+/g, ' ').trim()
}

function cellNumber(row: unknown[], index: number | undefined): number | null {
  if (index == null) return null
  const value = row[index]
  if (value == null || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const cleaned = String(value).replace(/[$,\s]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function cellQty(row: unknown[], index: number | undefined): number {
  const n = cellNumber(row, index)
  if (n == null) return 1
  return Math.max(0, Math.floor(n))
}

function isEmptyRow(row: unknown[] | undefined): boolean {
  if (!row) return true
  return row.every((cell) => cell == null || String(cell).trim() === '')
}

function flattenExcelValue(value: unknown): unknown {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (Array.isArray(record.richText)) {
      return (record.richText as Array<{ text?: string }>)
        .map((part) => part.text ?? '')
        .join('')
    }
    if ('result' in record) return flattenExcelValue(record.result)
    if (typeof record.text === 'string') return record.text
    if (typeof record.hyperlink === 'string') return record.hyperlink
    if ('error' in record) return ''
  }
  return String(value)
}

function isCsv(file: File): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.csv') || file.type === 'text/csv'
}

async function readCsv(file: File): Promise<{ sheetName: string; table: unknown[][] }> {
  const Papa = (await import('papaparse')).default
  const text = await file.text()
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: 'greedy',
  })
  if (parsed.errors.length && !parsed.data.length) {
    throw new Error(parsed.errors[0]?.message ?? 'Could not read this CSV file.')
  }
  return {
    sheetName: 'Sheet1',
    table: parsed.data.map((row) => row.map((cell) => cell ?? '')),
  }
}

type ExcelJSWorkbook = {
  xlsx: { load: (data: ArrayBuffer) => Promise<unknown> }
  worksheets: Array<{
    name?: string
    eachRow: (
      options: { includeEmpty: boolean },
      cb: (row: {
        eachCell: (
          options: { includeEmpty: boolean },
          cb: (cell: { value: unknown }, colNumber: number) => void,
        ) => void
      }) => void,
    ) => void
  }>
}

async function readXlsx(file: File): Promise<{ sheetName: string; table: unknown[][] }> {
  const mod = (await import('exceljs')) as unknown as {
    default?: { Workbook: new () => ExcelJSWorkbook }
    Workbook?: new () => ExcelJSWorkbook
  }
  const ExcelJS = mod.default ?? mod
  if (!ExcelJS.Workbook) {
    throw new Error('Could not load the Excel reader. Try a CSV export instead.')
  }
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheet = workbook.worksheets[0]
  if (!sheet) {
    throw new Error('This file does not contain a worksheet.')
  }

  const table: unknown[][] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: unknown[] = []
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cells[colNumber - 1] = flattenExcelValue(cell.value)
    })
    table.push(cells)
  })

  return {
    sheetName: sheet.name || 'Sheet1',
    table: table.map((row) => row ?? []),
  }
}

function rowsFromTable(
  fileName: string,
  sheetName: string,
  table: unknown[][],
): SpreadsheetParseResult {
  const compact = table.filter((row) => !isEmptyRow(row))
  if (compact.length === 0) {
    throw new Error('This spreadsheet is empty.')
  }

  const headerIndex = detectHeaderRow(compact)
  const headerRow = compact[headerIndex] ?? []
  const mapped = mapColumns(headerRow)

  if (mapped.itemNumber == null && mapped.itemName == null) {
    throw new Error(
      'Could not find an Item # / Item Name column. Use a BridalLive inventory export (.csv or .xlsx).',
    )
  }

  const rows: SpreadsheetInventoryRow[] = []
  let skippedRows = 0

  for (let i = headerIndex + 1; i < compact.length; i++) {
    const raw = compact[i]
    if (isEmptyRow(raw)) continue

    const itemNumber =
      cellString(raw, mapped.itemNumber) || cellString(raw, mapped.itemName)
    const itemName = cellString(raw, mapped.itemName) || itemNumber
    if (!itemNumber && !itemName) {
      skippedRows += 1
      continue
    }

    const quantity = cellQty(raw, mapped.quantity)
    rows.push({
      id: rows.length,
      itemNumber,
      vendorCode: cellString(raw, mapped.vendorCode),
      deptCode: cellString(raw, mapped.deptCode),
      itemName,
      description: cellString(raw, mapped.description),
      longDescription: cellString(raw, mapped.longDescription),
      vendorItemName: cellString(raw, mapped.vendorItemName),
      color: cellString(raw, mapped.color),
      size: cellString(raw, mapped.size),
      quantity,
      retailPrice: cellNumber(raw, mapped.retailPrice),
      salePrice: cellNumber(raw, mapped.salePrice),
      selected: quantity > 0,
    })
  }

  if (rows.length === 0) {
    throw new Error('Found column headers but no inventory rows to print.')
  }

  return {
    fileName,
    sheetName,
    headerRow: headerIndex + 1,
    mapped,
    rows,
    skippedRows,
  }
}

export async function parseSpreadsheet(file: File): Promise<SpreadsheetParseResult> {
  const { sheetName, table } = isCsv(file) ? await readCsv(file) : await readXlsx(file)
  return rowsFromTable(file.name, sheetName, table)
}

export function mappedFieldLabels(mapped: SpreadsheetParseResult['mapped']): string[] {
  const labels: Record<SpreadsheetColumnKey, string> = {
    itemNumber: 'Item #',
    vendorCode: 'Vendor Code',
    deptCode: 'Dept Code',
    itemName: 'Item Name',
    description: 'Description',
    longDescription: 'Long Description',
    vendorItemName: 'Vendor Item Name',
    color: 'Color',
    size: 'Size',
    quantity: 'O/H Qty',
    retailPrice: 'Retail Price',
    salePrice: 'Sale Price',
  }
  return (Object.keys(labels) as SpreadsheetColumnKey[])
    .filter((key) => mapped[key] != null)
    .map((key) => labels[key])
}
