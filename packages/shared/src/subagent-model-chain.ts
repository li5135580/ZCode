import { modelSelectionSchema, type ModelSelection } from "./model-selection.js";
import { z } from "zod";

/**
 * 备用模型数量上限。
 *
 * 产品上不限制用户添加多少个备用模型；这里保留一个足够大的硬上限，
 * 只用于防止误操作把 frontmatter 写成超大文件。
 */
export const MAX_SUBAGENT_MODEL_CHAIN_FALLBACKS = 20;

export interface SubagentModelChain {
  /** 主模型（第一个尝试的模型） */
  primary: ModelSelection;
  /** 备用模型列表（按顺序回退） */
  fallbacks: ModelSelection[];
  /** 每个模型的重试次数（默认 5） */
  retryCount: number;
}

export const subagentModelChainSchema = z
  .object({
    primary: modelSelectionSchema,
    fallbacks: z.array(modelSelectionSchema).max(MAX_SUBAGENT_MODEL_CHAIN_FALLBACKS),
    retryCount: z.number().int().positive().default(5),
  })
  .strict();

export type SubagentModelChainInput = z.input<typeof subagentModelChainSchema>;

/** 获取模型链中的所有模型（按执行顺序） */
export function getModelChainSelections(chain: SubagentModelChain): ModelSelection[] {
  return [chain.primary, ...chain.fallbacks];
}

/** 验证模型链是否有效 */
export function validateModelChain(chain: unknown): SubagentModelChain | null {
  const result = subagentModelChainSchema.safeParse(chain);
  return result.success ? result.data : null;
}
