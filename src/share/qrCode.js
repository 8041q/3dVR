const VERSION = 8
const SIZE = VERSION * 4 + 17
const DATA_CODEWORDS = 194
const EC_CODEWORDS_PER_BLOCK = 24
const BLOCK_COUNT = 2
const ALIGNMENT = [6, 24, 42]
const FORMAT_EC_LEVEL_L = 1
const MASK_PATTERN = 0

function utf8Bytes(value) {
  return [...new TextEncoder().encode(String(value || ''))]
}

function appendBits(bits, value, length) {
  for (let index = length - 1; index >= 0; index -= 1) {
    bits.push(((value >>> index) & 1) === 1)
  }
}

function dataCodewords(text) {
  const bytes = utf8Bytes(text)
  if (bytes.length > 192) {
    throw new Error('Share URL is too long for the built-in QR generator.')
  }

  const bits = []
  appendBits(bits, 0b0100, 4)
  appendBits(bits, bytes.length, 8)
  for (const byte of bytes) appendBits(bits, byte, 8)

  const capacity = DATA_CODEWORDS * 8
  const terminator = Math.min(4, capacity - bits.length)
  for (let index = 0; index < terminator; index += 1) bits.push(false)
  while (bits.length % 8 !== 0) bits.push(false)

  const words = []
  for (let offset = 0; offset < bits.length; offset += 8) {
    let word = 0
    for (let bit = 0; bit < 8; bit += 1) {
      if (bits[offset + bit]) word |= 1 << (7 - bit)
    }
    words.push(word)
  }

  const pads = [0xec, 0x11]
  let padIndex = 0
  while (words.length < DATA_CODEWORDS) {
    words.push(pads[padIndex % 2])
    padIndex += 1
  }

  return words
}

function gfMultiply(a, b) {
  let x = a
  let y = b
  let result = 0
  while (y > 0) {
    if (y & 1) result ^= x
    y >>= 1
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  return result
}

function generatorPolynomial(degree) {
  let polynomial = [1]
  let alpha = 1

  for (let index = 0; index < degree; index += 1) {
    const next = new Array(polynomial.length + 1).fill(0)
    for (let coefficient = 0; coefficient < polynomial.length; coefficient += 1) {
      next[coefficient] ^= polynomial[coefficient]
      next[coefficient + 1] ^= gfMultiply(polynomial[coefficient], alpha)
    }
    polynomial = next
    alpha = gfMultiply(alpha, 2)
  }

  return polynomial
}

function errorCorrection(data, degree) {
  const generator = generatorPolynomial(degree)
  const work = [...data, ...new Array(degree).fill(0)]

  for (let index = 0; index < data.length; index += 1) {
    const factor = work[index]
    if (!factor) continue
    for (let coefficient = 0; coefficient < generator.length; coefficient += 1) {
      work[index + coefficient] ^= gfMultiply(generator[coefficient], factor)
    }
  }

  return work.slice(data.length)
}

function finalCodewords(text) {
  const data = dataCodewords(text)
  const blocks = [data.slice(0, 97), data.slice(97, 194)]
  const parity = blocks.map((block) => errorCorrection(block, EC_CODEWORDS_PER_BLOCK))
  const output = []

  for (let index = 0; index < 97; index += 1) {
    for (let block = 0; block < BLOCK_COUNT; block += 1) output.push(blocks[block][index])
  }

  for (let index = 0; index < EC_CODEWORDS_PER_BLOCK; index += 1) {
    for (let block = 0; block < BLOCK_COUNT; block += 1) output.push(parity[block][index])
  }

  return output
}

function bchDigit(value) {
  let digit = 0
  let data = value
  while (data !== 0) {
    digit += 1
    data >>>= 1
  }
  return digit
}

function bchTypeInfo(data) {
  let value = data << 10
  const generator = 0x537
  while (bchDigit(value) - bchDigit(generator) >= 0) {
    value ^= generator << (bchDigit(value) - bchDigit(generator))
  }
  return ((data << 10) | value) ^ 0x5412
}

function bchTypeNumber(data) {
  let value = data << 12
  const generator = 0x1f25
  while (bchDigit(value) - bchDigit(generator) >= 0) {
    value ^= generator << (bchDigit(value) - bchDigit(generator))
  }
  return (data << 12) | value
}

function setupFinder(modules, row, col) {
  for (let r = -1; r <= 7; r += 1) {
    if (row + r < 0 || row + r >= SIZE) continue
    for (let c = -1; c <= 7; c += 1) {
      if (col + c < 0 || col + c >= SIZE) continue
      const dark = (
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4)
      )
      modules[row + r][col + c] = dark
    }
  }
}

function setupAlignment(modules) {
  for (const row of ALIGNMENT) {
    for (const col of ALIGNMENT) {
      if (modules[row][col] !== null) continue
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          modules[row + r][col + c] = Math.max(Math.abs(r), Math.abs(c)) !== 1
        }
      }
    }
  }
}

function setupTiming(modules) {
  for (let index = 8; index < SIZE - 8; index += 1) {
    if (modules[index][6] === null) modules[index][6] = index % 2 === 0
    if (modules[6][index] === null) modules[6][index] = index % 2 === 0
  }
}

function setupVersionInfo(modules) {
  const bits = bchTypeNumber(VERSION)
  for (let index = 0; index < 18; index += 1) {
    const dark = ((bits >> index) & 1) === 1
    modules[Math.floor(index / 3)][(index % 3) + SIZE - 11] = dark
    modules[(index % 3) + SIZE - 11][Math.floor(index / 3)] = dark
  }
}

function setupFormatInfo(modules) {
  const bits = bchTypeInfo((FORMAT_EC_LEVEL_L << 3) | MASK_PATTERN)

  for (let index = 0; index < 15; index += 1) {
    const dark = ((bits >> index) & 1) === 1

    if (index < 6) modules[index][8] = dark
    else if (index < 8) modules[index + 1][8] = dark
    else modules[SIZE - 15 + index][8] = dark

    if (index < 8) modules[8][SIZE - index - 1] = dark
    else if (index < 9) modules[8][7] = dark
    else modules[8][15 - index - 1] = dark
  }

  modules[SIZE - 8][8] = true
}

function mask(row, col) {
  return (row + col) % 2 === 0
}

function mapData(modules, codewords) {
  let direction = -1
  let row = SIZE - 1
  let bitIndex = 7
  let byteIndex = 0

  for (let col = SIZE - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1

    while (true) {
      for (let offset = 0; offset < 2; offset += 1) {
        const targetCol = col - offset
        if (modules[row][targetCol] !== null) continue

        let dark = false
        if (byteIndex < codewords.length) {
          dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1
        }
        if (mask(row, targetCol)) dark = !dark
        modules[row][targetCol] = dark

        bitIndex -= 1
        if (bitIndex < 0) {
          byteIndex += 1
          bitIndex = 7
        }
      }

      row += direction
      if (row < 0 || row >= SIZE) {
        row -= direction
        direction = -direction
        break
      }
    }
  }
}

export function createQrMatrix(text) {
  const modules = Array.from({ length: SIZE }, () => new Array(SIZE).fill(null))
  setupFinder(modules, 0, 0)
  setupFinder(modules, SIZE - 7, 0)
  setupFinder(modules, 0, SIZE - 7)
  setupAlignment(modules)
  setupTiming(modules)
  setupVersionInfo(modules)
  setupFormatInfo(modules)
  mapData(modules, finalCodewords(text))
  return modules
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function createQrSvg(text, { moduleSize = 5, quietZone = 4 } = {}) {
  const matrix = createQrMatrix(text)
  const totalModules = SIZE + quietZone * 2
  const dimension = totalModules * moduleSize
  const paths = []

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (!matrix[row][col]) continue
      paths.push(`M${(col + quietZone) * moduleSize} ${(row + quietZone) * moduleSize}h${moduleSize}v${moduleSize}h-${moduleSize}z`)
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR code for ${escapeXml(text)}" viewBox="0 0 ${dimension} ${dimension}" width="${dimension}" height="${dimension}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${paths.join('')}" fill="#000"/></svg>`
}
