import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runProcesses } from './process-group.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const https = process.argv.includes('--https')

console.log(`[dev] starting client, API and panorama worker${https ? ' with HTTPS' : ''}`)

runProcesses([
  {
    name: 'client',
    command: process.execPath,
    args: [viteCli, '--host', '0.0.0.0'],
    env: https ? { VITE_DEV_HTTPS: '1' } : {},
  },
  {
    name: 'api',
    command: process.execPath,
    args: [path.join(root, 'server', 'index.js')],
  },
  {
    name: 'worker',
    command: process.execPath,
    args: [path.join(root, 'server', 'panoramaWorker.js')],
  },
])
