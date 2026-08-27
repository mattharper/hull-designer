import fs from 'node:fs'
import path from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

const HULL_EXT = /\.hul$/i

function listHullFiles(hullDir: string): string[] {
  if (!fs.existsSync(hullDir)) return []
  return fs
    .readdirSync(hullDir)
    .filter((f) => HULL_EXT.test(f) && fs.statSync(path.join(hullDir, f)).isFile())
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

/**
 * Serves /hulls/* from the repo `hulls/` folder in dev, and copies them into
 * the build output so the Carlson library loads without uploading.
 */
export function hullLibraryPlugin(hullDir = path.resolve('hulls')): Plugin {
  const absHull = path.resolve(hullDir)
  let outDir = 'dist'

  return {
    name: 'hull-library',
    configResolved(config: ResolvedConfig) {
      outDir = config.build.outDir
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next()
        const url = req.url.split('?')[0]
        if (url === '/hulls/index.json') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(listHullFiles(absHull)))
          return
        }
        if (!url.startsWith('/hulls/')) return next()

        const name = decodeURIComponent(url.slice('/hulls/'.length))
        if (
          !name ||
          name.includes('..') ||
          name.includes('/') ||
          name.includes('\\')
        ) {
          res.statusCode = 400
          res.end('Bad request')
          return
        }
        const file = path.join(absHull, name)
        if (
          !file.startsWith(absHull) ||
          !fs.existsSync(file) ||
          !fs.statSync(file).isFile()
        ) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        fs.createReadStream(file).pipe(res)
      })
    },
    closeBundle() {
      const dest = path.resolve(outDir, 'hulls')
      fs.mkdirSync(dest, { recursive: true })
      const files = listHullFiles(absHull)
      fs.writeFileSync(path.join(dest, 'index.json'), JSON.stringify(files))
      for (const f of files) {
        fs.copyFileSync(path.join(absHull, f), path.join(dest, f))
      }
    },
  }
}
