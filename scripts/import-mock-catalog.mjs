/**
 * Regenerate src/inventory/mock-catalog-items.ts from items.xls at repo root.
 * Requires: pip install xlrd
 */
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const script = join(root, 'scripts', '_gen_mock_catalog.py')

execSync(`python3 ${JSON.stringify(script)}`, { stdio: 'inherit', cwd: root })
