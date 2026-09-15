// AI 供应商预设项
export interface AiProviderPreset {
  id: string;
  i18nKey: string;
  defaultBaseUrl: string;
  requiresKey: boolean;
  docsUrl?: string;
}

// 内置供应商列表，custom 排首位供设置页下拉使用
export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  { id: 'custom', i18nKey: 'ai_provider_custom', defaultBaseUrl: '', requiresKey: true },
  { id: 'openai', i18nKey: 'ai_provider_openai', defaultBaseUrl: 'https://api.openai.com/v1', requiresKey: true, docsUrl: 'https://platform.openai.com/' },
  { id: 'qwen', i18nKey: 'ai_provider_qwen', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', requiresKey: true, docsUrl: 'https://help.aliyun.com/zh/model-studio/developer-reference/use-qwen-by-calling-api' },
  { id: 'qwen-coding', i18nKey: 'ai_provider_qwen_coding', defaultBaseUrl: 'https://coding.dashscope.aliyuncs.com/v1', requiresKey: true, docsUrl: 'https://help.aliyun.com/zh/model-studio/coding-plan' },
  { id: 'qianwen-token-plan', i18nKey: 'ai_provider_qianwen_token_plan', defaultBaseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', requiresKey: true, docsUrl: 'https://platform.qianwenai.com/docs/token-plan/personal/token-plan-personal-quickstart' },
  { id: 'deepseek', i18nKey: 'ai_provider_deepseek', defaultBaseUrl: 'https://api.deepseek.com/v1', requiresKey: true, docsUrl: 'https://platform.deepseek.com/' },
  { id: 'kimi', i18nKey: 'ai_provider_kimi', defaultBaseUrl: 'https://api.moonshot.cn/v1', requiresKey: true, docsUrl: 'https://platform.moonshot.cn/' },
  { id: 'kimi-coding', i18nKey: 'ai_provider_kimi_coding', defaultBaseUrl: 'https://api.kimi.com/coding/v1', requiresKey: true, docsUrl: 'https://www.kimi.com/code/docs/' },
  { id: 'zhipu', i18nKey: 'ai_provider_zhipu', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', requiresKey: true, docsUrl: 'https://open.bigmodel.cn/' },
  { id: 'zhipu-coding', i18nKey: 'ai_provider_zhipu_coding', defaultBaseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4', requiresKey: true, docsUrl: 'https://docs.bigmodel.cn/cn/coding-plan/quick-start' },
  { id: 'zhipu-global-coding', i18nKey: 'ai_provider_zhipu_global_coding', defaultBaseUrl: 'https://api.z.ai/api/coding/paas/v4', requiresKey: true, docsUrl: 'https://docs.z.ai/devpack/quick-start' },
  { id: 'ernie', i18nKey: 'ai_provider_ernie', defaultBaseUrl: 'https://qianfan.baidubce.com/v2', requiresKey: true, docsUrl: 'https://cloud.baidu.com/doc/qianfan/index' },
  { id: 'opencode-go', i18nKey: 'ai_provider_opencode_go', defaultBaseUrl: 'https://opencode.ai/zen/go/v1', requiresKey: true, docsUrl: 'https://opencode.ai/docs/go/' },
  { id: 'MiniMax', i18nKey: 'ai_provider_MiniMax', defaultBaseUrl: 'https://api.minimaxi.com/v1', requiresKey: true, docsUrl: 'https://platform.minimaxi.com/' },
  { id: 'minimax-coding', i18nKey: 'ai_provider_minimax_coding', defaultBaseUrl: 'https://api.minimax.cn/v1', requiresKey: true, docsUrl: 'https://platform.minimaxi.com/docs/token-plan' },
];

// 按 id 查找预设，找不到时回退到 custom
export function getPresetById(id: string | undefined | null): AiProviderPreset {
  const preset = AI_PROVIDER_PRESETS.find((p) => p.id === id);
  return preset ?? AI_PROVIDER_PRESETS[0];
}
