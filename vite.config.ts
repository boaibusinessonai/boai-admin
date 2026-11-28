import react from '@vitejs/plugin-react'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/** The commit this build is, served as /version.txt (checked live, and shown by release-site as what a stage runs). */
const VERSION = process.env.GITHUB_SHA?.slice(0, 7) ?? new Date().toISOString().slice(0, 16)
function versionFile(): Plugin {
  return { name: 'dp-version', apply: 'build', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.txt', source: `${VERSION} ${new Date().toISOString()}\n` }) } }
}
/** V134: /release-files.json lists every file of the build (and the commit), so Admin › Releases (release-site, Admin) can copy
 *  this Admin website to the next stage's Admin site without building again (same as the main app, V91). */
function releaseFiles(): Plugin {
  let outDir = 'dist'
  return {
    name: 'dp-release-files', apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
    closeBundle() {
      const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)])
      const files = [...walk(outDir).map((file) => `/${relative(outDir, file).split(sep).join('/')}`), '/release-files.json']
      const list = [...new Set(files)].filter((file) => !file.split('/').some((part) => part.startsWith('.'))).sort()
      const site = (JSON.parse(readFileSync(new URL('./firebase.json', import.meta.url), 'utf8')) as { hosting: { cleanUrls?: boolean; rewrites?: unknown; headers?: unknown }[] }).hosting[0]
      const hosting = { cleanUrls: site?.cleanUrls, rewrites: site?.rewrites ?? [], headers: site?.headers ?? [] }
      writeFileSync(join(outDir, 'release-files.json'), `${JSON.stringify({ commit: process.env.GITHUB_SHA ?? null, files: list, hosting })}\n`)
    },
  }
}

// The BOAI admin portal: its own website, never part of the customer app.
export default defineConfig({
  plugins: [react(), versionFile(), releaseFiles()],
})
