/**
 * Query for BridalLive sale typeahead (`itemsSearchSettings.query`).
 * Uses item # — unique per row in the export and what BL inventory search indexes.
 * (Vendor+code concatenation did not return typeahead results.)
 */
export function buildSaleSearchQuery(_vendor: string, itemNumber: string): string {
  return itemNumber.trim()
}
