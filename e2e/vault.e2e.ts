// 真机 E2E：创建保险库 → 解锁进入 → 新增密钥 → 列表遮蔽 → 显示切换
// 数据目录由 wdio.conf.ts onPrepare 注入 EASY_KEYS_DATA_DIR（临时目录），不碰真实保险库。

const PASSWORD = 'e2e-test-password';
const KEY_NAME = 'E2E 测试密钥';
const KEY_VALUE = 'sk-e2e-abcdef1234567890';

describe('easy-keys 核心流程', () => {
  before(async () => {
    // 未安装 @wdio/tauri-plugin（JS 侧）时，service 的自动窗口聚焦检查会在每条命令前
    // 空等 5s；显式切换一次窗口后 service 会跳过该检查（视为用户已手动指定窗口）。
    try {
      await browser.tauri.switchWindow('main');
    } catch {
      /* 忽略：无 tauri-plugin-wdio 时仅用于抑制自动聚焦 */
    }
  });

  it('创建保险库（密码 ≥8 位）并进入密钥管理页', async () => {
    const pwdInput = await $('input[placeholder="主密码"]');
    await pwdInput.waitForExist({ timeout: 30000 });
    await pwdInput.setValue(PASSWORD);
    await $('input[placeholder="确认主密码"]').setValue(PASSWORD);
    await $('button=创建并进入').click();

    // 进入密钥管理页，空列表提示出现
    const addBtn = await $('button*=新增密钥');
    await addBtn.waitForExist({ timeout: 15000 });
    await expect($('div*=还没有任何密钥')).toExist();
  });

  it('新增密钥后列表出现该密钥且默认遮蔽', async () => {
    await (await $('button*=新增密钥')).click();

    const nameInput = await $('input[placeholder="如：我的 OpenAI 主号"]');
    await nameInput.waitForExist({ timeout: 10000 });
    await nameInput.setValue(KEY_NAME);
    await $('//input[@placeholder="https://api.openai.com/v1"]').setValue(
      'https://api.openai.com/v1'
    );
    await $('input[placeholder="sk-..."]').setValue(KEY_VALUE);
    await $('button=保存').click();

    // 列表中出现该密钥
    const nameCell = await $(`td*=${KEY_NAME}`);
    await nameCell.waitForExist({ timeout: 10000 });

    // 默认遮蔽：含掩码字符，不含完整明文
    const mask = await $('.key-mask');
    const masked = await mask.getText();
    expect(masked).toContain('•');
    expect(masked).not.toBe(KEY_VALUE);
    expect(masked).not.toContain('abcdef123456');
  });

  it('点击显示切换明文 / 再点隐藏恢复遮蔽', async () => {
    const showBtn = await $('button[title="显示"]');
    await showBtn.waitForExist({ timeout: 10000 });
    await showBtn.click();

    const mask = await $('.key-mask');
    await expect(mask).toHaveText(KEY_VALUE);

    const hideBtn = await $('button[title="隐藏"]');
    await hideBtn.click();
    const masked = await mask.getText();
    expect(masked).toContain('•');
    expect(masked).not.toContain('abcdef123456');
  });
});
