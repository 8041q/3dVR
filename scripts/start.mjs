import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runProcesses } from './process-group.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

runProcesses([
  {
    name: 'web-api',
    command: process.execPath,
    args: [path.join(root, 'server', 'index.js')],
    env: { NODE_ENV: 'production' },
  },
  {
    name: 'panorama-worker',
    command: process.execPath,
    args: [path.join(root, 'server', 'panoramaWorker.js')],
    env: { NODE_ENV: 'production' },
  },
])
