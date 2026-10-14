/**
 * 子智能体模型链编辑器。
 *
 * 让用户为子智能体配置「主模型 + 备用模型（最多 2 个）+ 失败重试次数」的模型链。
 * 主模型与每个备用模型都可以单独选择模型与思考等级（reasoning level）。
 *
 * 说明：真实的 ModelConfigSelect 是模型目录驱动的下拉菜单（modelGroups / normalizedValue /
 * triggerLabel / onValueChange），没有 value/onChange/placeholder 的受控表单 API；
 * 因此本组件额外接收模型目录数据（modelGroups、modelSelectionView、modelSelectionLoading），
 * 与 SubagentsSection 的 SubagentForm 保持同一套选型接线。
 */
import { useCallback, useMemo, type ChangeEvent } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { completeNewModelSelection } from "@zcode/provider";
import type { ModelSelection } from "@zcode/shared";
import type { ModelSelectionView } from "@zcode/services";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import {
  ModelConfigSelect,
  type ModelSelectFooterAction,
  type ModelSelectGroup,
} from "@/ModelConfigSelect.js";
import {
  SubagentReasoningField,
  type SubagentReasoningFieldState,
} from "@/settings/SubagentReasoningField.js";
import {
  isSubagentModelAvailable,
  resolveSubagentThoughtOptionState,
} from "@/settings/SubagentsSection.js";
import { resolveModelDisplayName } from "@/lib/modelSelectionGroups.js";
import { parseModelPickerValue } from "@/lib/zcodeSessionProjection.js";
import { encodeCustomModelValue } from "@/lib/zcodeCustomModelValue.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { cn } from "@/components/lib/utils.js";

/** 模型链编辑器维护的受控值；primary 允许暂缺，fallbacks 最多 2 个。 */
export interface SubagentModelChainEditorValue {
  /** 主模型（第一个尝试的模型） */
  primary?: ModelSelection;
  /** 备用模型列表（最多 2 个，按顺序回退） */
  fallbacks: ModelSelection[];
  /** 每个模型失败后的重试次数 */
  retryCount: number;
}

export interface SubagentModelChainEditorProps {
  /** 当前模型链值（受控） */
  value: SubagentModelChainEditorValue;
  /** 值变化回调（受控） */
  onChange: (value: SubagentModelChainEditorValue) => void;
  /** 禁用全部交互 */
  disabled?: boolean;
  /** 附加到根节点的 className */
  className?: string;
  /** 模型候选分组（ModelConfigSelect 的目录数据，来自 buildRegistryModelSelectGroups） */
  modelGroups: readonly ModelSelectGroup[];
  /** 模型选择视图，用于补齐思考档位默认值；未就绪时为 null */
  modelSelectionView?: ModelSelectionView | null;
  /** 模型目录是否仍在加载 */
  modelSelectionLoading: boolean;
  /** 「管理模型」入口；省略则不展示管理菜单项 */
  onManageModels?: () => void;
}

/** 备用模型数量上限 */
const MAX_FALLBACKS = 2;
/** 目录内模型不参与锁定 */
const MODEL_ITEM_NEVER_LOCKED = () => false;

/** 判断一个 ModelSelection 是否已完整填好 provider/model 身份（空占位不算已选）。 */
function hasModelIdentity(selection: ModelSelection | undefined): selection is ModelSelection {
  return Boolean(selection?.providerId && selection?.modelId);
}

/**
 * 单个模型槽位（主模型或某一个备用模型）的「模型选择 + 思考等级」控件。
 *
 * 复用 SubagentsSection 里 SubagentForm 的选型接线：ModelConfigSelect 负责选模型，
 * SubagentReasoningField 负责展示/切换当前模型支持的思考档位。
 */
function SubagentModelSlot({
  selection,
  placeholder,
  modelGroups,
  modelSelectionView,
  modelSelectionLoading,
  disabled,
  onChange,
  onManageModels,
  className,
}: {
  /** 当前槽位的模型选择；空对象占位会被当作「未选择」展示 */
  selection: ModelSelection | undefined;
  /** 未选择模型时触发器上展示的占位文案 */
  placeholder: string;
  modelGroups: readonly ModelSelectGroup[];
  modelSelectionView?: ModelSelectionView | null;
  modelSelectionLoading: boolean;
  disabled: boolean;
  /** 槽位选择变化；传入 undefined 表示清除 */
  onChange: (selection: ModelSelection | undefined) => void;
  onManageModels?: () => void;
  className?: string;
}) {
  const { intl } = useZCodeIntl();
  const hasSelection = hasModelIdentity(selection);
  const pickerValue = hasSelection
    ? encodeCustomModelValue(selection.providerId, selection.modelId)
    : "";
  const modelAvailable = isSubagentModelAvailable(
    modelGroups,
    pickerValue,
    modelSelectionLoading,
  );
  const triggerLabel = pickerValue
    ? (resolveModelDisplayName(modelGroups, pickerValue) ?? pickerValue)
    : placeholder;
  const thoughtLevelState: SubagentReasoningFieldState = resolveSubagentThoughtOptionState({
    model: pickerValue,
    modelAvailable,
    modelSelectionView,
    modelSelectionLoading,
    thoughtLevel: selection?.options?.reasoningLevel,
  });

  const handleValueChange = useCallback(
    (nextValue: string) => {
      const parsed = parseModelPickerValue(nextValue);
      // 选新模型时只采用目录给出的默认档位（模型不支持思考档位时为空），
      // 避免把上一个模型的 reasoningLevel 错带到不支持的模型上。
      const completed = modelSelectionView
        ? completeNewModelSelection(modelSelectionView, parsed)
        : undefined;
      const reasoningLevel = completed?.options?.reasoningLevel;
      onChange({
        providerId: parsed.providerId,
        modelId: parsed.modelId,
        ...(reasoningLevel ? { options: { reasoningLevel } } : {}),
      });
    },
    [modelSelectionView, onChange],
  );

  const handleClear = useCallback(() => {
    onChange(undefined);
  }, [onChange]);

  const handleReasoningCommit = useCallback(
    (reasoningLevel: string) => {
      if (!hasModelIdentity(selection)) {
        return;
      }
      if (reasoningLevel === selection.options?.reasoningLevel) {
        return;
      }
      onChange({
        providerId: selection.providerId,
        modelId: selection.modelId,
        ...(reasoningLevel ? { options: { reasoningLevel } } : {}),
      });
    },
    [onChange, selection],
  );

  const footerActions = useMemo<ModelSelectFooterAction[]>(() => {
    if (!pickerValue) {
      return [];
    }
    return [
      {
        key: "subagent-model-chain:clear",
        label: "清除模型",
        onSelect: handleClear,
      },
    ];
  }, [handleClear, pickerValue]);

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
      <ModelConfigSelect
        modelGroups={modelGroups}
        normalizedValue={pickerValue}
        triggerLabel={triggerLabel}
        showManageModelsAction={Boolean(onManageModels)}
        lockReasonMessage=""
        isItemLocked={MODEL_ITEM_NEVER_LOCKED}
        onValueChange={handleValueChange}
        footerActions={footerActions}
        manageModelsLabel={intl.formatMessage({
          id: "chat.toolbar.model.manageModels",
        })}
        onManageModels={onManageModels}
        contentSide="bottom"
        contentAlign="start"
        focusSelectorOnClose={null}
        labelVisibilityClassName="inline-flex min-w-0"
        triggerClassName="h-8 w-fit max-w-full min-w-0 justify-between rounded-lg border border-input-border bg-input bg-clip-border px-3 py-1.5 text-foreground hover:border-input-border-hover hover:bg-input focus-visible:border-input-border-focused focus-visible:bg-input-focused"
        triggerLabelClassName="inline-flex min-w-0 truncate text-left"
        disabled={disabled}
      />
      <SubagentReasoningField
        intl={intl}
        state={thoughtLevelState}
        disabled={disabled}
        labelVisibilityClassName="hidden sm:inline-flex"
        onValueCommit={handleReasoningCommit}
      />
    </div>
  );
}

/**
 * 子智能体模型链编辑器：主模型 + 备用模型（最多 2 个）+ 失败重试次数。
 *
 * 所有变更通过受控的 onChange 上抛完整模型链值；本组件不持有内部状态。
 * 模型候选与思考档位来自父级传入的模型目录数据。
 */
export function SubagentModelChainEditor({
  value,
  onChange,
  disabled = false,
  className,
  modelGroups,
  modelSelectionView,
  modelSelectionLoading,
  onManageModels,
}: SubagentModelChainEditorProps) {
  const handlePrimaryChange = useCallback(
    (selection: ModelSelection | undefined) => {
      onChange({ ...value, primary: selection });
    },
    [value, onChange],
  );

  const handleFallbackChange = useCallback(
    (index: number, selection: ModelSelection | undefined) => {
      const newFallbacks = [...value.fallbacks];
      if (selection) {
        newFallbacks[index] = selection;
      } else {
        newFallbacks.splice(index, 1);
      }
      onChange({ ...value, fallbacks: newFallbacks });
    },
    [value, onChange],
  );

  const handleAddFallback = useCallback(() => {
    if (value.fallbacks.length < MAX_FALLBACKS) {
      onChange({
        ...value,
        fallbacks: [...value.fallbacks, { providerId: "", modelId: "" }],
      });
    }
  }, [value, onChange]);

  const handleRemoveFallback = useCallback(
    (index: number) => {
      const newFallbacks = [...value.fallbacks];
      newFallbacks.splice(index, 1);
      onChange({ ...value, fallbacks: newFallbacks });
    },
    [value, onChange],
  );

  const handleRetryCountChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const count = parseInt(event.target.value, 10);
      if (!Number.isNaN(count) && count > 0) {
        onChange({ ...value, retryCount: count });
      }
    },
    [value, onChange],
  );

  return (
    <div className={cn("space-y-4", className)}>
      {/* 主模型 */}
      <div className="space-y-2">
        <Label>主模型</Label>
        <SubagentModelSlot
          selection={value.primary}
          placeholder="选择主模型"
          modelGroups={modelGroups}
          modelSelectionView={modelSelectionView}
          modelSelectionLoading={modelSelectionLoading}
          disabled={disabled}
          onChange={handlePrimaryChange}
          onManageModels={onManageModels}
        />
        <p className="text-sm text-muted-foreground">首先尝试使用的模型</p>
      </div>

      {/* 备用模型列表 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>备用模型（最多 {MAX_FALLBACKS} 个）</Label>
          {value.fallbacks.length < MAX_FALLBACKS && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddFallback}
              disabled={disabled}
            >
              <Plus className="h-4 w-4 mr-1" />
              添加备用模型
            </Button>
          )}
        </div>

        {value.fallbacks.map((fallback, index) => (
          <div
            key={index}
            className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50"
          >
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <SubagentModelSlot
                selection={fallback}
                placeholder={`备用模型 ${index + 1}`}
                modelGroups={modelGroups}
                modelSelectionView={modelSelectionView}
                modelSelectionLoading={modelSelectionLoading}
                disabled={disabled}
                onChange={(selection) => handleFallbackChange(index, selection)}
                onManageModels={onManageModels}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleRemoveFallback(index)}
              disabled={disabled}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        {value.fallbacks.length === 0 && (
          <p className="text-sm text-muted-foreground">主模型失败时将使用备用模型</p>
        )}
      </div>

      {/* 重试次数 */}
      <div className="space-y-2">
        <Label htmlFor="retry-count">失败重试次数</Label>
        <Input
          id="retry-count"
          type="number"
          min={1}
          max={10}
          value={value.retryCount}
          onChange={handleRetryCountChange}
          disabled={disabled}
          className="w-24"
        />
        <p className="text-sm text-muted-foreground">
          每个模型失败 {value.retryCount} 次后切换到下一个模型
        </p>
      </div>
    </div>
  );
}
