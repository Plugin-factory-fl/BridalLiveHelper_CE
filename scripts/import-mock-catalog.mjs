/**
 * Regenerate src/inventory/mock-catalog-items.ts from items.xls at repo root.
 * Requires: pip install xlrd (or run after npm run mock-catalog:import once with xlrd)
 */
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const xls = join(root, 'items.xls')
const out = join(root, 'src/inventory/mock-catalog-items.ts')

const py = `
import xlrd
wb = xlrd.open_workbook(${JSON.stringify(xls)})
sh = wb.sheet_by_index(0)
headers = [sh.cell_value(0, c).strip() for c in range(sh.ncols)]
idx = {h: headers.index(h) for h in headers}
DEPT_MAP = {'DS': 'Dress', 'SH': 'Shoes', 'JW': 'Jewelry'}

def cell_str(r, h):
    v = sh.cell_value(r, idx[h])
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v).strip()

def q(s):
    return s.replace('\\\\', '\\\\\\\\').replace("'", "\\\\'")

lines = []
lines.append('/** Real BridalLive export — source: items.xls at repo root */')
lines.append("import type { InventoryItem } from '../types/inventory'")
lines.append('')
lines.append('/** Regenerate: npm run mock-catalog:import */')
lines.append('export const MOCK_CATALOG_ITEMS: InventoryItem[] = [')

for r in range(1, sh.nrows):
    num = cell_str(r, 'Item Number')
    dept_code = cell_str(r, 'Dept Code') or 'DS'
    dept = DEPT_MAP.get(dept_code, 'Dress')
    style = cell_str(r, 'Item Name') or num
    vendor = cell_str(r, 'Vendor Code') or 'Unknown'
    sale_q = num
    color = cell_str(r, 'Color') or '—'
    size = cell_str(r, 'Size') or '—'
    oh = cell_str(r, 'O/H Qty')
    try:
        on_hand = int(float(oh)) if oh else 0
    except ValueError:
        on_hand = 0
    lines.append('  {')
    lines.append(f"    id: 'bl-{q(num)}',")
    lines.append(f"    itemNumber: '{q(num)}',")
    lines.append(f"    style: '{q(style)}',")
    lines.append(f"    vendor: '{q(vendor)}',")
    lines.append(f"    saleSearchQuery: '{q(sale_q)}',")
    lines.append(f"    department: '{dept}',")
    lines.append(f"    size: '{q(size)}',")
    lines.append(f"    color: '{q(color)}',")
    lines.append("    locationId: 'store-1',")
    lines.append("    locationName: 'Main Boutique',")
    lines.append(f'    onHand: {on_hand},')
    lines.append('  },')

lines.append(']')
lines.append('')
open(${JSON.stringify(out)}, 'w').write('\\n'.join(lines))
print('Wrote', ${JSON.stringify(out)}, 'rows', sh.nrows - 1)
`

execSync(`python3 -c ${JSON.stringify(py)}`, { stdio: 'inherit', cwd: root })
