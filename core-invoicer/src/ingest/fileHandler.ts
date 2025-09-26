import fs from 'fs-extra';
import path from 'path';
import unzipper from 'unzipper';
import { env } from '../config/env';

const VALID_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg']);

export async function prepareTmp() {
  await fs.ensureDir(env.TMP_DIR);
}

export function isZip(fileName: string) {
  return fileName.toLowerCase().endsWith('.zip');
}

export async function writeZipAndExtract(buffer: Buffer): Promise<{ files: { filePath: string; fileName: string; }[] }> {
  const zipPath = path.join(env.TMP_DIR, 'input.zip');
  const unzipDir = path.join(env.TMP_DIR, 'unzipped');
  await fs.ensureDir(unzipDir);
  await fs.writeFile(zipPath, buffer);
  await fs.emptyDir(unzipDir);
  await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: unzipDir })).promise();
  const files: { filePath: string; fileName: string; }[] = [];
  await walk(unzipDir, p => {
    const ext = path.extname(p).toLowerCase();
    if (VALID_EXT.has(ext)) files.push({ filePath: p, fileName: path.basename(p) });
  });
  return { files };
}

async function walk(dir: string, onFile: (p: string)=>void) {
  const entries = await fs.readdir(dir);
  for (const e of entries) {
    const full = path.join(dir, e);
    const stat = await fs.stat(full);
    if (stat.isDirectory()) await walk(full, onFile);
    else onFile(full);
  }
}
