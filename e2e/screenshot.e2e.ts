// 视觉截图 spec：走完 创建保险库 → 添加密钥 流程后，对各页面截图到 /tmp，供人工/UI 回归检查。
// 本 spec 不含会失败的断言（仅做存在性等待），也不依赖执行顺序：
// 起始状态可以是「未创建保险库」「已创建待解锁」或「已解锁」，均能自处理。
// 注意：wdio.conf.ts 中 specs 显式把它排在 vault.e2e.ts 之后，避免影响既有用例的起始状态。

import fs from 'node:fs';

const PASSWORD = 'e2e-test-password';
const SHOT_DIR = '/tmp';

async function saveShot(name: string) {
  const file = `${SHOT_DIR}/easy-keys-${name}.png`;
  try {
    await browser.saveScreenshot(file);
  } catch {
    // 部分 WebDriver 实现不支持 saveScreenshot 落盘，退化为 base64 自行写文件
    const base64 = await browser.takeScreenshot();
    fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  }
  // eslint-disable-next-line no-console
  console.log(`[screenshot] ${file}`);
}

async function ensureUnlockedWithKey() {
  // 已进入主界面？
  const addBtn = await $('button*=新增密钥');
  if (await addBtn.isExisting()) return;

  const pwdInput = await $('input[placeholder="主密码"]');
  await pwdInput.waitForExist({ timeout: 30000 });
  const confirmInput = await $('input[placeholder="确认主密码"]');
  await pwdInput.setValue(PASSWORD);
  if (await confirmInput.isExisting()) {
    await confirmInput.setValue(PASSWORD);
    await $('button=创建并进入').click();
  } else {
    await $('button=解锁').click();
  }
  await (await $('button*=新增密钥')).waitForExist({ timeout: 15000 });

  // 空列表时补一条密钥，便于检查表格行图标
  if (await (await $('div*=还没有任何密钥')).isExisting()) {
    await (await $('button*=新增密钥')).click();
    const nameInput = await $('input[placeholder="如：我的 OpenAI 主号"]');
    await nameInput.waitForExist({ timeout: 10000 });
    await nameInput.setValue('E2E 截图密钥');
    await $('//input[@placeholder="https://api.openai.com/v1"]').setValue(
      'https://api.openai.com/v1'
    );
    await $('input[placeholder="sk-..."]').setValue('sk-shot-abcdef1234567890');
    await $('button=保存').click();
    await (await $('td*=E2E 截图密钥')).waitForExist({ timeout: 10000 });
  }
}

describe('UI 视觉截图（无断言）', () => {
  before(async () => {
    try {
      await browser.tauri.switchWindow('main');
    } catch {
      /* 忽略：无 tauri-plugin-wdio 时仅用于抑制自动聚焦 */
    }
    await ensureUnlockedWithKey();
  });

  it('截取各页面', async () => {
    const pages: [string, string][] = [
      ['keys', '密钥管理'],
      ['speedtest', '连通性测速'],
      ['export', '导出 / 导入'],
      ['env', '环境变量'],
      ['settings', '设置'],
    ];
    for (const [name, label] of pages) {
      const nav = await $(`.nav-item*=${label}`);
      await nav.waitForExist({ timeout: 10000 });
      await nav.click();
      await browser.pause(400);
      // 读出当前高亮导航项打印到日志（纯记录，不做断言），同时给 WKWebView 重绘留出时间
      const activeText = await browser.execute(
        () => document.querySelector('.nav-item.active')?.textContent ?? '(none)'
      );
      // eslint-disable-next-line no-console
      console.log(`[screenshot] page=${name}, active nav=${activeText}`);
      await saveShot(name);
    }
  });
});
