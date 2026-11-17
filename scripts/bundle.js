const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const minify = args.includes('--minify');
const watch = args.includes('--watch');

const rootDir = path.resolve(__dirname, '..');
const versionFile = path.join(rootDir, 'version.txt');

let versionTag = (process.env.NIKRUN_VERSION_TAG || '').trim();
if (!versionTag) {
  let baseVer = '0.1.0';
  if (fs.existsSync(versionFile)) {
    baseVer = fs.readFileSync(versionFile, 'utf8').trim().replace(/^v/, '');
  }
  versionTag = `v${baseVer}-build.0-channel.dev`;
}

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: [path.join(rootDir, 'src', 'extension.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  minify,
  sourcemap: true,
  outfile: path.join(rootDir, 'dist', 'extension.js'),
  define: {
    __NIKRUN_VERSION__: JSON.stringify(versionTag)
  },
  logLevel: 'info'
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('[esbuild] Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
