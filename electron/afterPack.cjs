const fs = require('node:fs')
const path = require('node:path')

/**
 * Wrap the Linux binary so Steam / AppImage launches work without a
 * root-owned chrome-sandbox setuid helper.
 * @param {import('electron-builder').AfterPackContext} context
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return

  const outDir = context.appOutDir
  const info = context.packager.appInfo
  const candidates = [
    info.productFilename,
    info.productFilename.toLowerCase(),
    info.name,
    String(info.name).toLowerCase(),
  ]

  let binName = null
  for (const name of candidates) {
    if (!name) continue
    const candidate = path.join(outDir, name)
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      binName = name
      break
    }
  }

  if (!binName) {
    console.warn('[afterPack] Linux binary not found; skip --no-sandbox wrap')
    return
  }

  const binPath = path.join(outDir, binName)
  const realBin = path.join(outDir, `${binName}.bin`)
  if (fs.existsSync(realBin)) return

  fs.renameSync(binPath, realBin)
  fs.writeFileSync(
    binPath,
    `#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
export ELECTRON_DISABLE_SANDBOX=1
exec "$DIR/${binName}.bin" --no-sandbox "$@"
`,
    { mode: 0o755 },
  )
  console.log(`[afterPack] wrapped Linux binary ${binName} with --no-sandbox`)
}
