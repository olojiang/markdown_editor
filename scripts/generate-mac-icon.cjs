const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const sourceSvg = path.join(rootDir, 'build', 'icon.svg');
const outputIcns = path.join(rootDir, 'build', 'icon.icns');
const iconsetDir = path.join(rootDir, 'build', 'icon.iconset');
const basePng = path.join(iconsetDir, 'icon_1024.png');

const iconEntries = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

if (process.platform !== 'darwin') {
  throw new Error('macOS icon generation requires iconutil and must run on macOS.');
}

fs.rmSync(iconsetDir, { recursive: true, force: true });
fs.mkdirSync(iconsetDir, { recursive: true });

execFileSync('sips', ['-s', 'format', 'png', sourceSvg, '--out', basePng], { stdio: 'ignore' });
for (const [fileName, size] of iconEntries) {
  execFileSync('sips', ['-z', String(size), String(size), basePng, '--out', path.join(iconsetDir, fileName)], {
    stdio: 'ignore',
  });
}
fs.rmSync(basePng, { force: true });

execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', outputIcns], { stdio: 'inherit' });
fs.rmSync(iconsetDir, { recursive: true, force: true });
