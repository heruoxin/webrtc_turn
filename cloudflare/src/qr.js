// Copyright (C) 2026 webrtc_turn contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// A QR encoder small enough to inline. It covers byte mode at error
// correction level L in versions 1 to 5, which are the versions that hold a
// single relay URL and the only ones that use one error correction block.
// Anything longer than 106 bytes has no representation here.

// [total codewords, data codewords] per version, error correction level L.
const VERSIONS = [
  [26, 19],
  [44, 34],
  [70, 55],
  [100, 80],
  [134, 108],
];

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function remainder(data, count) {
  let gen = [1];
  for (let i = 0; i < count; i++) {
    const next = new Uint8Array(gen.length + 1);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= mul(gen[j], EXP[i]);
    }
    gen = next;
  }

  const rem = new Uint8Array(count);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.copyWithin(0, 1);
    rem[count - 1] = 0;
    for (let j = 0; j < count; j++) rem[j] ^= mul(gen[j + 1], factor);
  }
  return rem;
}

function codewords(bytes, version) {
  const [total, dataCount] = VERSIONS[version - 1];
  const bits = [];
  const push = (value, width) => {
    for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };

  push(0b0100, 4);
  push(bytes.length, 8);
  for (const byte of bytes) push(byte, 8);

  const capacity = dataCount * 8;
  for (let i = 0; i < 4 && bits.length < capacity; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  for (let i = 0; bits.length < capacity; i++) push(i % 2 === 0 ? 0xec : 0x11, 8);

  const data = new Uint8Array(dataCount);
  for (let i = 0; i < dataCount; i++) {
    for (let b = 0; b < 8; b++) data[i] = (data[i] << 1) | bits[i * 8 + b];
  }

  const out = new Uint8Array(total);
  out.set(data);
  out.set(remainder(data, total - dataCount), dataCount);
  return out;
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function grid(bytes, version) {
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Uint8Array(size));
  const fixed = Array.from({ length: size }, () => new Uint8Array(size));

  const finder = (row, col) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const y = row + r;
        const x = col + c;
        if (y < 0 || x < 0 || y >= size || x >= size) continue;
        fixed[y][x] = 1;
        const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        m[y][x] = inside && Math.max(Math.abs(r - 3), Math.abs(c - 3)) !== 2 ? 1 : 0;
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  if (version > 1) {
    const center = version * 4 + 10;
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        fixed[center + r][center + c] = 1;
        m[center + r][center + c] = Math.max(Math.abs(r), Math.abs(c)) !== 1 ? 1 : 0;
      }
    }
  }

  for (let i = 8; i < size - 8; i++) {
    m[6][i] = m[i][6] = i % 2 === 0 ? 1 : 0;
    fixed[6][i] = fixed[i][6] = 1;
  }

  for (let i = 0; i < 9; i++) fixed[8][i] = fixed[i][8] = 1;
  for (let i = 0; i < 8; i++) fixed[8][size - 1 - i] = fixed[size - 1 - i][8] = 1;
  m[size - 8][8] = 1;

  const stream = codewords(bytes, version);
  let bit = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let n = 0; n < size; n++) {
      const row = upward ? size - 1 - n : n;
      for (const c of [col, col - 1]) {
        if (fixed[row][c]) continue;
        const byte = stream[bit >> 3];
        m[row][c] = byte === undefined ? 0 : (byte >> (7 - (bit & 7))) & 1;
        bit++;
      }
    }
    upward = !upward;
  }

  return { m, fixed, size };
}

// The four penalty rules from the specification. Rule 3 in particular is not
// optional in practice: without it the chosen mask can grow a stripe that reads
// as a finder pattern, and scanners then fail on an otherwise valid symbol.
function penalty(m, size) {
  let score = 0;
  let dark = 0;
  const lines = [];

  for (let a = 0; a < size; a++) {
    let row = "";
    let col = "";
    for (let b = 0; b < size; b++) {
      row += m[a][b];
      col += m[b][a];
      dark += m[a][b];
    }
    lines.push(row, col);
  }

  for (const line of lines) {
    let run = 1;
    for (let i = 1; i < size; i++) {
      run = line[i] === line[i - 1] ? run + 1 : 1;
      if (run >= 5) score += run === 5 ? 3 : 1;
    }
    for (let i = 0; i + 11 <= size; i++) {
      const window = line.slice(i, i + 11);
      if (window === "10111010000" || window === "00001011101") score += 40;
    }
  }

  for (let r = 0; r + 1 < size; r++) {
    for (let c = 0; c + 1 < size; c++) {
      const value = m[r][c];
      if (value === m[r][c + 1] && value === m[r + 1][c] && value === m[r + 1][c + 1]) score += 3;
    }
  }

  return score + Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
}

function formatBits(mask) {
  const value = 0b01000 | mask;
  let rest = value << 10;
  for (let i = 4; i >= 0; i--) {
    if (rest & (1 << (i + 10))) rest ^= 0x537 << i;
  }
  return ((value << 10) | rest) ^ 0x5412;
}

function render(bytes, version) {
  const { m, fixed, size } = grid(bytes, version);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = m.map((row, r) =>
      row.map((value, c) => (fixed[r][c] ? value : value ^ (MASKS[mask](r, c) ? 1 : 0))),
    );
    const bits = formatBits(mask);
    const at = (row, col, index) => (candidate[row][col] = (bits >> index) & 1);
    for (let i = 0; i <= 5; i++) at(i, 8, i);
    at(7, 8, 6);
    at(8, 8, 7);
    at(8, 7, 8);
    for (let i = 9; i < 15; i++) at(8, 14 - i, i);
    for (let i = 0; i < 8; i++) at(8, size - 1 - i, i);
    for (let i = 8; i < 15; i++) at(size - 15 + i, 8, i);
    candidate[size - 8][8] = 1;

    const score = penalty(candidate, size);
    if (best === null || score < best.score) best = { score, candidate };
  }
  return { modules: best.candidate, size };
}

// Returns an inline SVG, or null when the text is too long for version 5.
export function qrSvg(text, scale = 6) {
  const bytes = new TextEncoder().encode(text);
  const version = VERSIONS.findIndex(([, data]) => bytes.length <= data - 2) + 1;
  if (version === 0) return null;

  const { modules, size } = render(bytes, version);
  const quiet = 4;
  const side = (size + quiet * 2) * scale;

  let path = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) path += `M${(c + quiet) * scale} ${(r + quiet) * scale}h${scale}v${scale}h-${scale}z`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}" role="img" aria-label="Relay URL as a QR code"><rect width="${side}" height="${side}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
