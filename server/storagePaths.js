import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const STORAGE_ROOT = process.env.VR_STORAGE_ROOT
  ? path.resolve(process.env.VR_STORAGE_ROOT)
  : path.join(__dirname, '..', 'storage')

export const INCOMING_ROOT = path.join(STORAGE_ROOT, 'incoming')
export const MASTER_ROOT = path.join(STORAGE_ROOT, 'masters')
export const JOB_ROOT = path.join(STORAGE_ROOT, 'jobs')
export const PANORAMA_ROOT = path.join(STORAGE_ROOT, 'panoramas')
export const WORK_ROOT = path.join(STORAGE_ROOT, 'work')
