#!/usr/bin/env python3
"""One-shot regenerator for mock-catalog-items.ts from items.xls."""
import xlrd
from pathlib import Path

root = Path(__file__).resolve().parent.parent
xls = root / "items.xls"
out = root / "src" / "inventory" / "mock-catalog-items.ts"

wb = xlrd.open_workbook(str(xls))
sh = wb.sheet_by_index(0)
headers = [sh.cell_value(0, c).strip() for c in range(sh.ncols)]
idx = {h: headers.index(h) for h in headers}
DEPT_MAP = {"DS": "Dress", "SH": "Shoes", "JW": "Jewelry"}


def cell_str(r, h):
    v = sh.cell_value(r, idx[h])
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v).strip()


def cell_num(r, h):
    v = sh.cell_value(r, idx[h])
    if v == "" or v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def q(s):
    return s.replace("\\", "\\\\").replace("'", "\\'")


def parse_colors(desc: str, fallback_color: str):
    parts = [p.strip() for p in desc.replace(";", ",").split(",") if p.strip()]
    # Keep short-ish color-like tokens; drop empty / junk
    colors = []
    for p in parts:
        if len(p) > 40:
            continue
        colors.append(p)
    if colors:
        return colors
    if fallback_color and fallback_color != "—":
        return [fallback_color]
    return []


lines = []
lines.append("/** Real BridalLive export — source: items.xls at repo root */")
lines.append("import type { InventoryItem } from '../types/inventory'")
lines.append("")
lines.append("/** Regenerate: npm run mock-catalog:import */")
lines.append("export const MOCK_CATALOG_ITEMS: InventoryItem[] = [")

for r in range(1, sh.nrows):
    num = cell_str(r, "Item Number")
    dept_code = cell_str(r, "Dept Code") or "DS"
    dept = DEPT_MAP.get(dept_code, "Dress")
    style = cell_str(r, "Item Name") or num
    vendor_item_name = cell_str(r, "Vendor Item Name") or style
    vendor = cell_str(r, "Vendor Code") or "Unknown"
    sale_q = num
    color = cell_str(r, "Color") or "—"
    size = cell_str(r, "Size") or "—"
    oh = cell_str(r, "O/H Qty")
    try:
        on_hand = int(float(oh)) if oh else 0
    except ValueError:
        on_hand = 0
    retail = cell_num(r, "Retail Price")
    sale = cell_num(r, "Sale Price")
    colors = parse_colors(cell_str(r, "Description"), color)

    lines.append("  {")
    lines.append(f"    id: 'bl-{q(num)}',")
    lines.append(f"    itemNumber: '{q(num)}',")
    lines.append(f"    style: '{q(style)}',")
    lines.append(f"    vendorItemName: '{q(vendor_item_name)}',")
    lines.append(f"    vendor: '{q(vendor)}',")
    lines.append(f"    saleSearchQuery: '{q(sale_q)}',")
    lines.append(f"    department: '{dept}',")
    lines.append(f"    size: '{q(size)}',")
    lines.append(f"    color: '{q(color)}',")
    lines.append("    locationId: 'store-1',")
    lines.append("    locationName: 'Main Boutique',")
    lines.append(f"    onHand: {on_hand},")
    if retail is not None:
        lines.append(f"    retailPrice: {retail},")
    if sale is not None:
        lines.append(f"    salePrice: {sale},")
    if colors:
        color_list = ", ".join(f"'{q(c)}'" for c in colors)
        lines.append(f"    availableColors: [{color_list}],")
    lines.append("  },")

lines.append("]")
lines.append("")
out.write_text("\n".join(lines))
print("Wrote", out, "rows", sh.nrows - 1)
