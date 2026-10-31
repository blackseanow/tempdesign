// 把 Three.js 打成只含用到的模块的一个 ES 模块文件：vendor/three.pano.min.js
// three 0.187 的 npm 包里已经不带压缩版了，整包 2 MB；这里用 esbuild 摇树后约 0.5 MB。
// 用法（在任意空目录里）：
//   npm i three@0.187.0 esbuild@0.25.10
//   node <仓库>/home-pano/tools/build-three.mjs <仓库>/home-pano/vendor/three.pano.min.js
// 要用新的 three 类，先加到下面的 EXPORTS 里再跑一遍。
import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const EXPORTS = [
  'WebGLRenderer', 'Scene', 'PerspectiveCamera', 'Group', 'Mesh', 'BufferGeometry', 'BufferAttribute',
  'PlaneGeometry', 'MeshBasicMaterial', 'Texture', 'CanvasTexture', 'SRGBColorSpace', 'NoColorSpace',
  'LinearFilter', 'LinearMipmapLinearFilter', 'ClampToEdgeWrapping', 'Color', 'Vector3', 'Matrix4',
  'Quaternion', 'Euler', 'Object3D', 'DoubleSide', 'FrontSide', 'BackSide', 'NormalBlending',
  'AdditiveBlending', 'MathUtils', 'REVISION',
  'AlwaysStencilFunc', 'EqualStencilFunc', 'ReplaceStencilOp', 'KeepStencilOp',
  'CustomBlending', 'OneFactor', 'OneMinusSrcAlphaFactor', 'AddEquation', 'LinearSRGBColorSpace',
];
// esbuild 和 three 从当前目录的 node_modules 里找
const { build } = createRequire(join(process.cwd(), 'noop.js'))('esbuild');
const out = process.argv[2];
if (!out) { console.error('用法：node build-three.mjs <输出文件>'); process.exit(1); }
const dir = mkdtempSync(join(tmpdir(), 'three-'));
const entry = join(dir, 'entry.js');
writeFileSync(entry, `export { ${EXPORTS.join(', ')} } from 'three';\n`);
await build({ entryPoints: [entry], bundle: true, format: 'esm', minify: true, target: 'es2020', outfile: out, legalComments: 'eof', nodePaths: [join(process.cwd(), 'node_modules')], absWorkingDir: process.cwd() });
console.log('写好了', out);
