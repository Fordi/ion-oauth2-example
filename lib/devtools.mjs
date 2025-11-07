// Allows for editing in devtools, and prevents an annoying 404
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// read more here: https://developer.chrome.com/docs/devtools/workspaces
export async function makeWorkspace(docRoot) {
  const osRoot = existsSync('/mnt/c') ? execSync(`wslpath -aw "${docRoot}"`).toString().trim() : docRoot;
  await mkdir(join(docRoot, '.well-known', 'appspecific'), { recursive: true });
  await writeFile(join(docRoot, '.well-known', 'appspecific', 'com.chrome.devtools.json'), JSON.stringify({
    workspace: {
      uuid: 'a4347fb1-d650-4da8-858c-2fac90b75e84',
      root: osRoot,
    }
  }), 'utf-8');
  return osRoot;
}