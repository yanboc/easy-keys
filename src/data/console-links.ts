// 控制台页数据：各家提供商的按量付费与 Coding Plan 购买/管理入口。
// 链接为空表示该家暂无此类产品（UI 显示 —）。

export interface ConsoleLink {
  /** 提供商 / 项目名 */
  name: string;
  /** 备注（如字节旗下有多条线） */
  note?: string;
  /** 按量付费：购买 / 管理控制台 */
  meteredUrl: string;
  /** Coding / Token Plan 订阅入口 */
  planUrl: string | null;
}

export const CONSOLE_LINKS: ConsoleLink[] = [
  {
    name: "OpenAI",
    meteredUrl: "https://platform.openai.com/api-keys",
    planUrl: "https://chatgpt.com/pricing",
  },
  {
    name: "Anthropic",
    note: "Claude / Claude Code",
    meteredUrl: "https://console.anthropic.com/",
    planUrl: "https://claude.ai/pricing",
  },
  {
    name: "Google",
    note: "Gemini",
    meteredUrl: "https://aistudio.google.com/apikey",
    planUrl: "https://one.google.com/about/google-ai-plans/",
  },
  {
    name: "DeepSeek",
    meteredUrl: "https://platform.deepseek.com/",
    planUrl: null,
  },
  {
    name: "Moonshot",
    note: "Kimi / Kimi Code",
    meteredUrl: "https://platform.moonshot.cn/console/api-keys",
    planUrl: "https://www.kimi.com/",
  },
  {
    name: "字节跳动",
    note: "火山引擎 · 方舟 Ark",
    meteredUrl: "https://console.volcengine.com/ark",
    planUrl: "https://www.volcengine.com/product/ark",
  },
  {
    name: "阿里云",
    note: "百炼 Bailian",
    meteredUrl: "https://bailian.console.aliyun.com/",
    planUrl: "https://www.aliyun.com/product/bailian",
  },
  {
    name: "智谱",
    note: "GLM",
    meteredUrl: "https://open.bigmodel.cn/",
    planUrl: "https://bigmodel.cn/",
  },
];
