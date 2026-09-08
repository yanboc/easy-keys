import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 服务选项对象：onPrepare 中创建临时数据目录后，往 env 里注入 EASY_KEYS_DATA_DIR，
// 保证 E2E 启动的应用绝不触碰真实保险库 ~/Library/Application Support/easy-keys/
const tauriServiceOptions = {
  driverProvider: 'embedded', // WebDriver server 内嵌在应用进程（tauri-plugin-wdio-webdriver，e2e feature）
  env: {} as Record<string, string>,
};

let e2eDataDir: string | null = null;

export const config = {
  runner: 'local',
  // 显式列出执行顺序：截图 spec 必须在 vault 流程之后跑，
  // 否则它先创建保险库会破坏 vault.e2e.ts 对初始状态的假设
  specs: ['./e2e/vault.e2e.ts', './e2e/screenshot.e2e.ts'],
  maxInstances: 1,
  logLevel: 'warn',
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    timeout: 120000,
  },
  waitforTimeout: 15000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  services: [['@wdio/tauri-service', tauriServiceOptions]],
  capabilities: [
    {
      browserName: 'tauri',
      // 指向 debug 构建产物（须以 --features e2e 构建，见 npm run test:e2e:build）
      'tauri:options': {
        application: './src-tauri/target/debug/tokey',
      },
    },
  ],
  onPrepare() {
    e2eDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tokey-e2e-'));
    tauriServiceOptions.env.EASY_KEYS_DATA_DIR = e2eDataDir;
    // eslint-disable-next-line no-console
    console.log(`[e2e] 临时数据目录: ${e2eDataDir}`);
  },
  onComplete() {
    if (e2eDataDir) {
      fs.rmSync(e2eDataDir, { recursive: true, force: true });
      e2eDataDir = null;
    }
  },
};
