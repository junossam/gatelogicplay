// 예제 폴더(samples/)·기본 제공 칩 폴더(chips/)를 배포 결과에 넣고 목록 <폴더>/index.json을 만드는 Vite 플러그인.
// 개발 서버에서는 요청할 때마다 폴더를 다시 읽으므로 파일을 넣고 새로고침만 하면 된다.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { buildManifest, CHIPS_DIR, isSafeSamplePath, MANIFEST_FILE, SAMPLES_DIR } from '../src/model/samples';

/** 폴더 안의 .json 파일 전부 (하위 폴더 포함, 경로는 '/'로) */
function collect(root: string, sub = ''): { file: string; json: string }[] {
  const dir = join(root, sub);
  if (!existsSync(dir)) return [];
  const out: { file: string; json: string }[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const rel = sub ? `${sub}/${name}` : name;
    if (statSync(join(root, rel)).isDirectory()) out.push(...collect(root, rel));
    else if (/\.json$/i.test(name)) out.push({ file: rel, json: readFileSync(join(root, rel), 'utf8') });
  }
  return out;
}

/** dir: 소스 폴더이자 배포 결과 안의 폴더 이름 */
export function bundleFolderPlugin(dir: string): Plugin {
  let root = resolve(dir);
  return {
    name: `gatelogicplay-${dir}`,
    configResolved(config) {
      root = resolve(config.root, dir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const prefix = `/${dir}/`;
        const path = (req.url ?? '').split('?')[0]!;
        if (!path.startsWith(prefix)) return next();
        let rel: string;
        try {
          rel = decodeURIComponent(path.slice(prefix.length));
        } catch {
          return next();
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        if (rel === MANIFEST_FILE) {
          const { manifest, errors } = buildManifest(collect(root));
          for (const e of errors) server.config.logger.warn(`[${dir}] ${e}`);
          res.end(JSON.stringify(manifest));
          return;
        }
        const file = join(root, rel);
        if (!isSafeSamplePath(rel) || !existsSync(file)) {
          res.statusCode = 404;
          res.end('{}');
          return;
        }
        res.end(readFileSync(file, 'utf8'));
      });
    },
    generateBundle() {
      const files = collect(root);
      const { manifest, errors } = buildManifest(files);
      // 잘못된 예제가 섞인 채 배포되지 않도록 빌드를 멈춘다
      if (errors.length) this.error(`${dir}/ 폴더의 파일을 읽을 수 없습니다:\n${errors.join('\n')}`);
      for (const f of files) this.emitFile({ type: 'asset', fileName: `${dir}/${f.file}`, source: f.json });
      this.emitFile({ type: 'asset', fileName: `${dir}/${MANIFEST_FILE}`, source: JSON.stringify(manifest) });
    },
  };
}

/** 운영자 예제 */
export const samplesPlugin = () => bundleFolderPlugin(SAMPLES_DIR);
/** 기본 제공 칩 */
export const chipsPlugin = () => bundleFolderPlugin(CHIPS_DIR);
