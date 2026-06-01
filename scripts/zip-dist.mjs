import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const out = join(root, 'bridallive-helper-dist.zip')

if (!existsSync(dist)) {
  console.error('dist/ missing. Run npm run build first.')
  process.exit(1)
}

execSync(`cd "${dist}" && zip -r "${out}" .`, { stdio: 'inherit' })
console.log('Wrote', out)
