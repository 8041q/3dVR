import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runProcesses } from './process-group.mjs'
import { developmentEnvironment, trustedApplicationOrigins } from '../server/origin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const development = developmentEnvironment(process.env, process.argv.includes('--https'))
const https = development.VITE_DEV_HTTPS === '1'

console.log(`[dev] starting client, API and panorama worker${https ? ' with HTTPS' : ''}`)
console.log(`[dev] Workspace: ${development.APP_ORIGIN}/`)
console.log(`[dev] Sign-in is enabled for: ${trustedApplicationOrigins({...process.env,...development,NODE_ENV:'development'}).join(', ')}`)

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
    args: ['--watch', path.join(root, 'server', 'index.js')],
  },
  {
    name: 'worker',
    command: process.execPath,
    args: ['--watch', path.join(root, 'server', 'panoramaWorker.js')],
  },
], { env: { ...process.env, ...development, NODE_ENV:'development' } })
