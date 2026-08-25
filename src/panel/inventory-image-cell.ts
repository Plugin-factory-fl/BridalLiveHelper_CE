import type { InventoryItem } from '../types/inventory'

/** Thumbnail or Phase 2 placeholder for inventory table Image column. */
export function inventoryImageCellHtml(
  item: InventoryItem,
  esc: (s: string) => string,
): string {
  if (item.imageUrl) {
    return `<td class="inv-image-cell">
      <img
        class="inv-item-thumb"
        src="${esc(item.imageUrl)}"
        alt="Photo of item ${esc(item.itemNumber)}"
        loading="lazy"
        width="64"
        height="64"
      />
    </td>`
  }

  const deptHint =
    item.department === 'Shoes'
      ? 'Shoes'
      : item.department === 'Jewelry'
        ? 'Jewelry'
        : 'Dress'

  return `<td class="inv-image-cell">
    <span
      class="inv-item-thumb inv-item-thumb--placeholder"
      role="img"
      aria-label="No photo yet (${deptHint})"
      title="No photo for this item"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
        <circle cx="9" cy="10" r="1.5" fill="currentColor"/>
        <path d="M4 16l4-4 3 3 5-6 4 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
  </td>`
}
