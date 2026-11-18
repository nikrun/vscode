const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const rootDir = path.resolve(__dirname, '..');
const brandDir = path.join(rootDir, 'brand');
const imagesDir = path.join(rootDir, 'images');

const lightSvgPath = path.join(brandDir, 'svg', 'nikrun-icon-light.svg');
const darkSvgPath = path.join(brandDir, 'svg', 'nikrun-icon-dark-mono.svg');
const iconPngPath = path.join(brandDir, 'png', 'nikrun-icon-256.png');

if (!fs.existsSync(lightSvgPath) || !fs.existsSync(iconPngPath)) {
  throw new Error(
    `Nikrun brand submodule not initialized at '${brandDir}'. Run: git submodule update --init --depth 1`
  );
}

fs.mkdirSync(imagesDir, { recursive: true });

// 1. Copy Marketplace icon (256x256 PNG) & Object Pascal language file icons (Light/Dark SVGs)
fs.copyFileSync(iconPngPath, path.join(imagesDir, 'icon.png'));
fs.copyFileSync(lightSvgPath, path.join(imagesDir, 'file-icon-light.svg'));
fs.copyFileSync(darkSvgPath, path.join(imagesDir, 'file-icon-dark.svg'));

// 2. Compile nikrun-icon-light.svg into a single-glyph WOFF 1.0 icon font (U+E001) for VS Code contributes.icons
function parseSvgSubpathsToFontContours(svgText) {
  const m = svgText.match(/d="([^"]+)"/);
  if (!m) throw new Error('Could not find path data in nikrun-icon-light.svg');
  const tokens = m[1].match(/[MLCZ]|-?\d+(?:\.\d+)?/g) || [];

  // Map SVG [27..229]x[23..233] (center 128, 128, span ~210) -> 1024 UPM (ascender=896, descender=-128, centerY=384)
  const SCALE = 940.0 / 210.0;
  const toFont = (sx, sy) => ({
    x: Math.round(512 + (sx - 128.0) * SCALE),
    y: Math.round(384 - (sy - 128.0) * SCALE)
  });

  // Flatten cubic Beziers to short crisp segments (or quadratic curves) — 6 subdivisions per cubic at 1024 UPM gives <0.25 unit precision and ultra-simple on-curve TrueType contours!
  const rawContours = [];
  let curContour = [];
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let i = 0;

  while (i < tokens.length) {
    const t = tokens[i++];
    if (t === 'M') {
      if (curContour.length >= 3) rawContours.push(curContour);
      cx = parseFloat(tokens[i++]);
      cy = parseFloat(tokens[i++]);
      sx = cx; sy = cy;
      curContour = [toFont(cx, cy)];
    } else if (t === 'L') {
      cx = parseFloat(tokens[i++]);
      cy = parseFloat(tokens[i++]);
      curContour.push(toFont(cx, cy));
    } else if (t === 'C') {
      const x1 = parseFloat(tokens[i++]), y1 = parseFloat(tokens[i++]);
      const x2 = parseFloat(tokens[i++]), y2 = parseFloat(tokens[i++]);
      const x3 = parseFloat(tokens[i++]), y3 = parseFloat(tokens[i++]);
      const steps = 6;
      for (let s = 1; s <= steps; s++) {
        const u = s / steps, it = 1 - u;
        const bx = it * it * it * cx + 3 * it * it * u * x1 + 3 * it * u * u * x2 + u * u * u * x3;
        const by = it * it * it * cy + 3 * it * it * u * y1 + 3 * it * u * u * y2 + u * u * u * y3;
        curContour.push(toFont(bx, by));
      }
      cx = x3; cy = y3;
    } else if (t === 'Z') {
      if (curContour.length >= 3) {
        const first = curContour[0], last = curContour[curContour.length - 1];
        if (first.x === last.x && first.y === last.y) curContour.pop();
        if (curContour.length >= 3) rawContours.push(curContour);
      }
      curContour = [];
      cx = sx; cy = sy;
    }
  }
  if (curContour.length >= 3) rawContours.push(curContour);

  // Deduplicate consecutive identical integer points
  const cleaned = rawContours
    .map((pts) => {
      const out = [];
      for (const p of pts) {
        const prev = out[out.length - 1];
        if (!prev || prev.x !== p.x || prev.y !== p.y) out.push(p);
      }
      if (out.length > 1 && out[0].x === out[out.length - 1].x && out[0].y === out[out.length - 1].y) {
        out.pop();
      }
      return out;
    })
    .filter((pts) => pts.length >= 3);

  // Shoelace signed area in Y-up space: > 0 means CCW, < 0 means CW.
  // In TrueType (non-zero winding): outer solid contour MUST be CW (area < 0), inner holes MUST be CCW (area > 0).
  const signedArea = (pts) => {
    let a = 0;
    for (let j = 0; j < pts.length; j++) {
      const p1 = pts[j], p2 = pts[(j + 1) % pts.length];
      a += p1.x * p2.y - p2.x * p1.y;
    }
    return 0.5 * a;
  };

  cleaned.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  return cleaned.map((pts, idx) => {
    const area = signedArea(pts);
    const wantNegative = idx === 0; // idx 0 is outer head silhouette; idx >= 1 are inner holes
    if ((wantNegative && area > 0) || (!wantNegative && area < 0)) {
      return pts.slice().reverse();
    }
    return pts;
  });
}

function buildNikrunTtfAndWoff(contours) {
  let xMin = 32767, yMin = 32767, xMax = -32768, yMax = -32768, totalPts = 0;
  for (const c of contours) {
    totalPts += c.length;
    for (const p of c) {
      if (p.x < xMin) xMin = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.x > xMax) xMax = p.x;
      if (p.y > yMax) yMax = p.y;
    }
  }

  // Build glyf table: Glyph 0 (.notdef empty, 0 bytes) + Glyph 1 (U+E001 Nikrun Cheetah)
  const endPts = [];
  const allPts = [];
  let acc = -1;
  for (const c of contours) {
    acc += c.length;
    endPts.push(acc);
    for (const p of c) allPts.push(p);
  }

  const glyfChunks = [];
  const hdr = Buffer.alloc(10 + contours.length * 2 + 2);
  hdr.writeInt16BE(contours.length, 0);
  hdr.writeInt16BE(xMin, 2);
  hdr.writeInt16BE(yMin, 4);
  hdr.writeInt16BE(xMax, 6);
  hdr.writeInt16BE(yMax, 8);
  for (let i = 0; i < contours.length; i++) hdr.writeUInt16BE(endPts[i], 10 + i * 2);
  hdr.writeUInt16BE(0, 10 + contours.length * 2); // instructionLength = 0
  glyfChunks.push(hdr);

  // Flags: all on-curve (0x01), uncompressed int16 deltas (simple & 100% bug-free)
  glyfChunks.push(Buffer.alloc(totalPts, 0x01));

  const xBuf = Buffer.alloc(totalPts * 2);
  const yBuf = Buffer.alloc(totalPts * 2);
  let px = 0, py = 0;
  for (let i = 0; i < totalPts; i++) {
    xBuf.writeInt16BE(allPts[i].x - px, i * 2);
    yBuf.writeInt16BE(allPts[i].y - py, i * 2);
    px = allPts[i].x;
    py = allPts[i].y;
  }
  glyfChunks.push(xBuf, yBuf);
  let glyf1 = Buffer.concat(glyfChunks);
  if (glyf1.length % 4 !== 0) {
    glyf1 = Buffer.concat([glyf1, Buffer.alloc(4 - (glyf1.length % 4), 0)]);
  }
  const glyf = glyf1; // Glyph 0 has length 0 (offset 0..0), Glyph 1 at offset 0..glyf1.length

  // loca (short format = uint16 offsets / 2, 3 entries for 2 glyphs)
  const loca = Buffer.alloc(6);
  loca.writeUInt16BE(0, 0);
  loca.writeUInt16BE(0, 2);
  loca.writeUInt16BE(glyf.length >>> 1, 4);

  // head (54 bytes)
  const head = Buffer.alloc(54);
  head.writeUInt32BE(0x00010000, 0); // version 1.0
  head.writeUInt32BE(0x00010000, 4); // fontRevision 1.0
  head.writeUInt32BE(0, 8);          // checkSumAdjustment (filled after assembling TTF)
  head.writeUInt32BE(0x5F0F3CF5, 12);// magicNumber
  head.writeUInt16BE(0x000B, 16);    // flags
  head.writeUInt16BE(1024, 18);      // unitsPerEm
  head.writeInt16BE(xMin, 36);
  head.writeInt16BE(yMin, 38);
  head.writeInt16BE(xMax, 40);
  head.writeInt16BE(yMax, 42);
  head.writeUInt16BE(0, 44);         // macStyle
  head.writeUInt16BE(8, 46);         // lowestRecPPEM
  head.writeInt16BE(2, 48);          // fontDirectionHint
  head.writeInt16BE(0, 50);          // indexToLocFormat = 0 (short)
  head.writeInt16BE(0, 52);          // glyphDataFormat

  // hhea (36 bytes)
  const hhea = Buffer.alloc(36);
  hhea.writeUInt32BE(0x00010000, 0);
  hhea.writeInt16BE(896, 4);         // ascender
  hhea.writeInt16BE(-128, 6);        // descender
  hhea.writeInt16BE(0, 8);           // lineGap
  hhea.writeUInt16BE(1024, 10);      // advanceWidthMax
  hhea.writeInt16BE(xMin, 12);       // minLeftSideBearing
  hhea.writeInt16BE(1024 - xMax, 14);// minRightSideBearing
  hhea.writeInt16BE(xMax, 16);       // xMaxExtent
  hhea.writeInt16BE(1, 18);          // caretSlopeRise
  hhea.writeUInt16BE(2, 34);         // numberOfHMetrics = 2

  // hmtx (8 bytes: 2 glyphs)
  const hmtx = Buffer.alloc(8);
  hmtx.writeUInt16BE(512, 0);  hmtx.writeInt16BE(0, 2);
  hmtx.writeUInt16BE(1024, 4); hmtx.writeInt16BE(xMin, 6);

  // maxp (32 bytes, version 1.0)
  const maxp = Buffer.alloc(32);
  maxp.writeUInt32BE(0x00010000, 0);
  maxp.writeUInt16BE(2, 4);                 // numGlyphs
  maxp.writeUInt16BE(totalPts, 6);          // maxPoints
  maxp.writeUInt16BE(contours.length, 8);   // maxContours
  maxp.writeUInt16BE(1, 14);                // maxZones

  // OS/2 (78 bytes, version 1)
  const os2 = Buffer.alloc(78);
  os2.writeUInt16BE(1, 0);
  os2.writeInt16BE(1024, 2);                // xAvgCharWidth
  os2.writeUInt16BE(400, 4);                // usWeightClass = Regular
  os2.writeUInt16BE(5, 6);                  // usWidthClass = Medium
  os2.slice(32, 42).fill(0);
  os2.write('NIKR', 58, 4, 'ascii');
  os2.writeUInt16BE(0x0040, 62);            // fsSelection = REGULAR
  os2.writeUInt16BE(0xE001, 64);            // usFirstCharIndex
  os2.writeUInt16BE(0xE001, 66);            // usLastCharIndex
  os2.writeInt16BE(896, 68);                // sTypoAscender
  os2.writeInt16BE(-128, 70);               // sTypoDescender
  os2.writeInt16BE(0, 72);                  // sTypoLineGap
  os2.writeUInt16BE(896, 74);               // usWinAscent
  os2.writeUInt16BE(128, 76);               // usWinDescent

  // post (32 bytes, format 3.0 = no glyph names required)
  const post = Buffer.alloc(32);
  post.writeUInt32BE(0x00030000, 0);

  // cmap (format 4 mapping U+E001 -> glyph 1, plus U+FFFF sentinel)
  const sub = Buffer.alloc(32);
  sub.writeUInt16BE(4, 0);                  // format 4
  sub.writeUInt16BE(32, 2);                 // length
  sub.writeUInt16BE(0, 4);                  // language
  sub.writeUInt16BE(4, 6);                  // segCountX2 = 2 * 2 = 4
  sub.writeUInt16BE(4, 8);                  // searchRange
  sub.writeUInt16BE(1, 10);                 // entrySelector
  sub.writeUInt16BE(0, 12);                 // rangeShift
  sub.writeUInt16BE(0xE001, 14);            // endCode[0]
  sub.writeUInt16BE(0xFFFF, 16);            // endCode[1]
  sub.writeUInt16BE(0, 18);                 // reservedPad
  sub.writeUInt16BE(0xE001, 20);            // startCode[0]
  sub.writeUInt16BE(0xFFFF, 22);            // startCode[1]
  sub.writeInt16BE((1 - 0xE001) & 0xFFFF, 24); // idDelta[0]: (0xE001 + delta) mod 65536 = 1
  sub.writeInt16BE(1, 26);                  // idDelta[1]
  sub.writeUInt16BE(0, 28);                 // idRangeOffset[0]
  sub.writeUInt16BE(0, 30);                 // idRangeOffset[1]

  const cmapHdr = Buffer.alloc(12);
  cmapHdr.writeUInt16BE(0, 0);
  cmapHdr.writeUInt16BE(1, 2);              // numTables = 1 (Windows BMP Unicode 3,1)
  cmapHdr.writeUInt16BE(3, 4);              // platformID = 3 (Windows)
  cmapHdr.writeUInt16BE(1, 6);              // encodingID = 1 (Unicode BMP)
  cmapHdr.writeUInt32BE(12, 8);             // offset
  const cmap = Buffer.concat([cmapHdr, sub]);

  // name table (minimal Windows UTF-16BE records for family/full/postscript name "nikrun-icons")
  const strUtf16BE = (s) => {
    const b = Buffer.alloc(s.length * 2);
    for (let i = 0; i < s.length; i++) b.writeUInt16BE(s.charCodeAt(i), i * 2);
    return b;
  };
  const nameEntries = [
    [1, 'nikrun-icons'],
    [2, 'Regular'],
    [4, 'nikrun-icons'],
    [6, 'nikrun-icons']
  ];
  const strParts = [];
  const recBuf = Buffer.alloc(6 + nameEntries.length * 12);
  recBuf.writeUInt16BE(0, 0);
  recBuf.writeUInt16BE(nameEntries.length, 2);
  recBuf.writeUInt16BE(6 + nameEntries.length * 12, 4);
  let strOff = 0;
  nameEntries.forEach(([nameId, val], idx) => {
    const sb = strUtf16BE(val);
    strParts.push(sb);
    const ro = 6 + idx * 12;
    recBuf.writeUInt16BE(3, ro);            // platformID = Windows
    recBuf.writeUInt16BE(1, ro + 2);        // encodingID = Unicode BMP
    recBuf.writeUInt16BE(0x0409, ro + 4);   // languageID = en-US
    recBuf.writeUInt16BE(nameId, ro + 6);
    recBuf.writeUInt16BE(sb.length, ro + 8);
    recBuf.writeUInt16BE(strOff, ro + 10);
    strOff += sb.length;
  });
  const name = Buffer.concat([recBuf, ...strParts]);

  // Sort tables alphabetically by tag as required by OpenType & WOFF 1.0 spec
  const tables = [
    ['OS/2', os2],
    ['cmap', cmap],
    ['glyf', glyf],
    ['head', head],
    ['hhea', hhea],
    ['hmtx', hmtx],
    ['loca', loca],
    ['maxp', maxp],
    ['name', name],
    ['post', post]
  ].sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const calcChecksum = (buf) => {
    const padded = buf.length % 4 === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4), 0)]);
    let sum = 0;
    for (let i = 0; i < padded.length; i += 4) {
      sum = (sum + padded.readUInt32BE(i)) >>> 0;
    }
    return sum;
  };

  // Assemble SFNT (.ttf) to compute exact checkSumAdjustment in head
  const numTables = tables.length;
  const maxPow2 = 1 << Math.floor(Math.log2(numTables));
  const searchRange = maxPow2 * 16;
  const entrySelector = Math.floor(Math.log2(numTables));
  const rangeShift = numTables * 16 - searchRange;

  const sfntHdr = Buffer.alloc(12 + numTables * 16);
  sfntHdr.writeUInt32BE(0x00010000, 0);
  sfntHdr.writeUInt16BE(numTables, 4);
  sfntHdr.writeUInt16BE(searchRange, 6);
  sfntHdr.writeUInt16BE(entrySelector, 8);
  sfntHdr.writeUInt16BE(rangeShift, 10);

  let ttfOffset = sfntHdr.length;
  const paddedTables = [];
  let headIdx = -1;
  tables.forEach(([tag, buf], idx) => {
    if (tag === 'head') headIdx = idx;
    const csum = calcChecksum(buf);
    const padLen = (4 - (buf.length % 4)) % 4;
    const pBuf = padLen ? Buffer.concat([buf, Buffer.alloc(padLen, 0)]) : buf;
    const dirOff = 12 + idx * 16;
    sfntHdr.write(tag, dirOff, 4, 'ascii');
    sfntHdr.writeUInt32BE(csum, dirOff + 4);
    sfntHdr.writeUInt32BE(ttfOffset, dirOff + 8);
    sfntHdr.writeUInt32BE(buf.length, dirOff + 12);
    paddedTables.push(pBuf);
    ttfOffset += pBuf.length;
  });

  const fullTtf = Buffer.concat([sfntHdr, ...paddedTables]);
  const fontCsum = calcChecksum(fullTtf);
  const checkSumAdjustment = (0xB1B0AFBA - fontCsum) >>> 0;
  head.writeUInt32BE(checkSumAdjustment, 8);
  // Update head checksum in table record too
  sfntHdr.writeUInt32BE(calcChecksum(head), 12 + headIdx * 16 + 4);

  // Assemble WOFF 1.0 container (RFC / W3C WOFF 1.0 spec)
  const woffHeaderSize = 44 + numTables * 20;
  let woffOffset = woffHeaderSize;
  const woffDir = Buffer.alloc(numTables * 20);
  const woffDataParts = [];

  tables.forEach(([tag, origBuf], idx) => {
    const comp = zlib.deflateSync(origBuf);
    const useBuf = comp.length < origBuf.length ? comp : origBuf;
    const padLen = (4 - (useBuf.length % 4)) % 4;
    const pUse = padLen ? Buffer.concat([useBuf, Buffer.alloc(padLen, 0)]) : useBuf;

    const doff = idx * 20;
    woffDir.write(tag, doff, 4, 'ascii');
    woffDir.writeUInt32BE(woffOffset, doff + 4);
    woffDir.writeUInt32BE(useBuf.length, doff + 8);
    woffDir.writeUInt32BE(origBuf.length, doff + 12);
    woffDir.writeUInt32BE(calcChecksum(origBuf), doff + 16);

    woffDataParts.push(pUse);
    woffOffset += pUse.length;
  });

  const woffHdr = Buffer.alloc(44);
  woffHdr.write('wOFF', 0, 4, 'ascii');
  woffHdr.writeUInt32BE(0x00010000, 4);      // flavor = TrueType
  woffHdr.writeUInt32BE(woffOffset, 8);      // total WOFF length
  woffHdr.writeUInt16BE(numTables, 12);
  woffHdr.writeUInt16BE(0, 14);              // reserved
  woffHdr.writeUInt32BE(ttfOffset, 16);      // totalSfntSize
  woffHdr.writeUInt16BE(1, 20);              // majorVersion
  woffHdr.writeUInt16BE(0, 22);              // minorVersion

  return {
    ttf: Buffer.concat([sfntHdr, ...tables.map(([_, b]) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4), 0)]) : b))]),
    woff: Buffer.concat([woffHdr, woffDir, ...woffDataParts])
  };
}

const lightSvgText = fs.readFileSync(lightSvgPath, 'utf8');
const contours = parseSvgSubpathsToFontContours(lightSvgText);
const { woff } = buildNikrunTtfAndWoff(contours);
fs.writeFileSync(path.join(imagesDir, 'nikrun-icons.woff'), woff);

console.log(`[sync-brand] Synced icon.png, file-icon-{light,dark}.svg & nikrun-icons.woff (${woff.length} bytes)`);
