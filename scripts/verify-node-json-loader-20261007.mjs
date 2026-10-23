// Node 加载钩子：让不带 `with { type: 'json' }` 的 JSON import 也能在 Node 里跑
// （项目源码用 Vite 打包，JSON 直接 import；Node 22 需要显式属性，这里兜底）。
// 用法：node --experimental-loader ./scripts/verify-node-json-loader-20261007.mjs <script>
import { readFile } from 'node:fs/promises';

export async function load(url, context, nextLoad) {
  if (url.endsWith('.json')) {
    return { format: 'json', source: await readFile(new URL(url), 'utf8'), shortCircuit: true };
  }
  return nextLoad(url, context);
}
