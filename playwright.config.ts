import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { arch, homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

process.env.E2E_PORT ??= execFileSync(
  process.execPath,
  ['-e', "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"],
  { encoding: 'utf8' },
).trim();
const port = process.env.E2E_PORT;
const base = `http://127.0.0.1:${port}/wg-arcade/`;

const libRoot = join(homedir(), '.local/share/paime-chromium-libs');
const cpu = ({ arm64: 'aarch64', x64: 'x86_64' } as Record<string, string>)[arch()];
const libDir = join(libRoot, `root/usr/lib/${cpu}-linux-gnu`);
const fontConf = join(libRoot, 'fonts.conf');
const launchOptions = cpu && existsSync(libDir) && existsSync(fontConf)
  ? {
      env: {
        ...process.env,
        LD_LIBRARY_PATH: libDir + (process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ''),
        FONTCONFIG_FILE: fontConf,
      } as Record<string, string>,
    }
  : {};

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: 'list',
  retries: process.env.CI ? 1 : 0,
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --strictPort --port ${port}`,
    url: base,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: base,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
