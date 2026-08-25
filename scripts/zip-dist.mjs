import { execSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const out = join(root, `bridallive-helper-${version}.zip`)

if (!existsSync(dist)) {
  console.error('dist/ missing. Run npm run build first.')
  process.exit(1)
}

if (existsSync(out)) unlinkSync(out)
execSync(`cd "${dist}" && zip -r "${out}" . -x "*.map" -x "*.DS_Store"`, { stdio: 'inherit' })
console.log('Wrote', out)
console.log(`Chrome Web Store version: ${version}`)
