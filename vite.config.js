import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import selfsigned from 'selfsigned'
import { defineConfig } from 'vite'

function isPrivateIpv4Address(value) {
  return /^\d+\.\d+\.\d+\.\d+$/.test(value) && !value.startsWith('169.254.')
}

function getCertificateHosts() {
  const hosts = new Set(['localhost', 'localhost.localdomain', '127.0.0.1'])
  const hostname = os.hostname().trim()

  if (hostname) {
    hosts.add(hostname)
    if (!hostname.includes('.')) {
      hosts.add(`${hostname}.local`)
    }
  }

  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal && isPrivateIpv4Address(address.address)) {
        hosts.add(address.address)
      }
    }
  }

  return Array.from(hosts).sort()
}

function getCertificateCachePaths() {
  const certDir = path.join(process.cwd(), 'node_modules', '.vite', 'lan-https')
  return {
    certDir,
    keyPath: path.join(certDir, 'dev.key'),
    certPath: path.join(certDir, 'dev.crt'),
    metaPath: path.join(certDir, 'dev.json'),
  }
}

function readCachedCertificate(paths, hostList) {
  if (!fs.existsSync(paths.keyPath) || !fs.existsSync(paths.certPath) || !fs.existsSync(paths.metaPath)) {
    return null
  }

  try {
    const cached = JSON.parse(fs.readFileSync(paths.metaPath, 'utf8'))
    if (JSON.stringify(cached.hosts) !== JSON.stringify(hostList)) {
      return null
    }

    return {
      key: fs.readFileSync(paths.keyPath),
      cert: fs.readFileSync(paths.certPath),
    }
  } catch {
    return null
  }
}

function writeCertificate(paths, hostList, certificate) {
  fs.mkdirSync(paths.certDir, { recursive: true })
  fs.writeFileSync(paths.keyPath, certificate.private)
  fs.writeFileSync(paths.certPath, certificate.cert)
  fs.writeFileSync(paths.metaPath, JSON.stringify({ hosts: hostList }, null, 2))

  return {
    key: fs.readFileSync(paths.keyPath),
    cert: fs.readFileSync(paths.certPath),
  }
}

function createHttpsConfig() {
  const hostList = getCertificateHosts()
  const paths = getCertificateCachePaths()
  const cachedCertificate = readCachedCertificate(paths, hostList)

  if (cachedCertificate) {
    return cachedCertificate
  }

  const certificate = selfsigned.generate(
    [{ name: 'commonName', value: hostList[0] }],
    {
      algorithm: 'sha256',
      days: 30,
      keySize: 2048,
      extensions: [
        {
          name: 'subjectAltName',
          altNames: hostList.map((host) => (
            isPrivateIpv4Address(host)
              ? { type: 7, ip: host }
              : { type: 2, value: host }
          )),
        },
      ],
    }
  )

  return writeCertificate(paths, hostList, certificate)
}

const httpsConfig = createHttpsConfig()

export default defineConfig({
  server: {
    host: true,
    https: httpsConfig,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  preview: {
    host: true,
    https: httpsConfig,
  },
})