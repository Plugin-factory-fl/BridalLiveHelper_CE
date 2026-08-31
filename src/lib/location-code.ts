/** Location shorthand for tables and tags (Poughkeepsie → PK, PLM stays PLM). */
export function locationShorthand(name: string): string {
  const key = name.trim().toLowerCase()
  const known: Record<string, string> = {
    poughkeepsie: 'PK',
    plm: 'PLM',
    'white plains': 'PLM',
    'white-plains': 'PLM',
    wp: 'PLM',
    'main boutique': 'MB',
    'second location': 'SL',
  }
  if (known[key]) return known[key]

  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  }
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, '')
  return (cleaned.slice(0, 2) || '?').toUpperCase()
}
