/* eslint-disable max-lines -- 备用模型行需要与模型下拉、思考档位接线共处一个受控组件，拆分收益低于跨文件跳转成本。 */
/**
 * 子智能体模型链编辑器。
 *
 * 让用户为子智能体配置「备用模型列表 + 失败重试次数」。
 * 主模型统一使用表单上方的「模型」字段，本编辑器不再渲染主模型槽位；
 * value.primary 仍保留在受控值里，由父级用上方模型填充后再持久化。
 *
 * 说明：真实的 ModelConfigSelect 是模型目录驱动的下拉菜单（modelGroups / normalizedValue /
 * triggerLabel / onValueChange），没有 value/onChange/placeholder 的受控表单 API；
 * 因此本组件额外接收模型目录数据（modelGroups、modelSelectionView、modelSelectionLoading），
 * 与 SubagentsSection 的 SubagentForm 保持同一套选型接线。
 */
import { useCallback, useMemo, type ChangeEvent, type CSSProperties } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { completeNewModelSelection } from "@zcode/provider";
import { MAX_SUBAGENT_MODEL_CHAIN_FALLBACKS, type ModelSelection } from "@zcode/shared";
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

/** 模型链编辑器维护的受控值；primary 由父级用上方模型字段填充，本组件不渲染。 */
export interface SubagentModelChainEditorValue {
  /** 主模型（第一个尝试的模型），与表单上方的「模型」字段同源 */
  primary?: ModelSelection;
  /** 备用模型列表（按顺序回退） */
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

export { MAX_SUBAGENT_MODEL_CHAIN_FALLBACKS };
/** 新建模型链时每个模型的默认失败重试次数，与 shared 的 subagentModelChainSchema 默认值一致 */
export const DEFAULT_SUBAGENT_MODEL_CHAIN_RETRY_COUNT = 5;
/** 目录内模型不参与锁定 */
const MODEL_ITEM_NEVER_LOCKED = () => false;

/** 判断一个 ModelSelection 是否已完整填好 provider/model 身份（空占位不算已选）。 */
function hasModelIdentity(selection: ModelSelection | undefined): selection is ModelSelection {
  return Boolean(selection?.providerId && selection?.modelId);
}

/**
 * 为备用模型行生成稳定的拖拽 id。
 *
 * 备用模型没有持久化 id，且允许存在多个空占位行，因此用「模型身份 + 同身份出现序号」
 * 生成 id：重排后 id 跟随模型内容，React 不会把某行的控件实例错配给另一行。
 * 思考等级不参与 id，避免切换档位时整行重新挂载。
 */
export function resolveSubagentModelChainFallbackIds(
  fallbacks: readonly ModelSelection[],
): string[] {
  const occurrences = new Map<string, number>();
  return fallbacks.map((fallback) => {
    const base = [fallback.providerId, fallback.modelId].join("\u0000");
    const seen = occurrences.get(base) ?? 0;
    occurrences.set(base, seen + 1);
    return `${base}\u0000${seen}`;
  });
}

/** 备用模型重排（拖拽与上移/下移共用）；越界或原地移动时返回副本，避免受控值被原地改写。 */
export function reorderSubagentModelChainFallbacks(
  fallbacks: readonly ModelSelection[],
  fromIndex: number,
  toIndex: number,
): ModelSelection[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= fallbacks.length ||
    toIndex >= fallbacks.length
  ) {
    return [...fallbacks];
  }
  return arrayMove([...fallbacks], fromIndex, toIndex);
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
        label: intl.formatMessage({ id: "settings.subagents.modelChain.clearModel" }),
        onSelect: handleClear,
      },
    ];
  }, [handleClear, intl, pickerValue]);

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

/** 备用模型行：拖拽手柄只挂在 GripVertical 上，避免与行内模型下拉菜单抢指针事件。 */
function SortableFallbackRow({
  id,
  index,
  total,
  fallback,
  modelGroups,
  modelSelectionView,
  modelSelectionLoading,
  disabled,
  dragHint,
  moveUpLabel,
  moveDownLabel,
  removeLabel,
  placeholder,
  onChange,
  onMove,
  onRemove,
  onManageModels,
}: {
  id: string;
  index: number;
  total: number;
  fallback: ModelSelection;
  modelGroups: readonly ModelSelectGroup[];
  modelSelectionView?: ModelSelectionView | null;
  modelSelectionLoading: boolean;
  disabled: boolean;
  dragHint: string;
  moveUpLabel: string;
  moveDownLabel: string;
  removeLabel: string;
  placeholder: string;
  onChange: (selection: ModelSelection | undefined) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  onManageModels?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const style = useMemo<CSSProperties>(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 10 : undefined,
      opacity: isDragging ? 0.6 : 1,
    }),
    [isDragging, transition, transform],
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-border bg-card p-3"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={dragHint}
        title={dragHint}
        disabled={disabled || total < 2}
        className="shrink-0 cursor-grab touch-none rounded-sm p-1 text-foreground-subtle outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <div className="flex shrink-0 flex-col">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => onMove(-1)}
          disabled={disabled || index === 0}
          aria-label={moveUpLabel}
          title={moveUpLabel}
        >
          <ChevronUp aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => onMove(1)}
          disabled={disabled || index === total - 1}
          aria-label={moveDownLabel}
          title={moveDownLabel}
        >
          <ChevronDown aria-hidden="true" />
        </Button>
      </div>
      <div className="min-w-0 flex-1">
        <SubagentModelSlot
          selection={fallback}
          placeholder={placeholder}
          modelGroups={modelGroups}
          modelSelectionView={modelSelectionView}
          modelSelectionLoading={modelSelectionLoading}
          disabled={disabled}
          onChange={onChange}
          onManageModels={onManageModels}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-md"
        onClick={onRemove}
        disabled={disabled}
        aria-label={removeLabel}
        title={removeLabel}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * 子智能体模型链编辑器：备用模型列表 + 失败重试次数。
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
    if (value.fallbacks.length < MAX_SUBAGENT_MODEL_CHAIN_FALLBACKS) {
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

  const handleMoveFallback = useCallback(
    (index: number, offset: -1 | 1) => {
      onChange({
        ...value,
        fallbacks: reorderSubagentModelChainFallbacks(
          value.fallbacks,
          index,
          index + offset,
        ),
      });
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

  const fallbackIds = useMemo(
    () => resolveSubagentModelChainFallbackIds(value.fallbacks),
    [value.fallbacks],
  );

  const fallbackRows = useMemo(
    () =>
      value.fallbacks.map((fallback, index) => ({
        id: fallbackIds[index] ?? `fallback\u0000${index}`,
        fallback,
        index,
      })),
    [fallbackIds, value.fallbacks],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }
      const fromIndex = fallbackIds.indexOf(String(active.id));
      const toIndex = fallbackIds.indexOf(String(over.id));
      if (fromIndex < 0 || toIndex < 0) {
        return;
      }
      onChange({
        ...value,
        fallbacks: reorderSubagentModelChainFallbacks(value.fallbacks, fromIndex, toIndex),
      });
    },
    [fallbackIds, onChange, value],
  );

  const { intl } = useZCodeIntl();
  const fallbacksLabel = intl.formatMessage({ id: "settings.subagents.modelChain.fallbacks" });
  const retryCountLabel = intl.formatMessage({ id: "settings.subagents.modelChain.retryCount" });
  const dragHint = intl.formatMessage({ id: "settings.subagents.modelChain.dragHint" });
  const canAddFallback = value.fallbacks.length < MAX_SUBAGENT_MODEL_CHAIN_FALLBACKS;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-1">
        <h4 className="text-ui-base font-medium text-foreground">
          {intl.formatMessage({ id: "settings.subagents.modelChain.title" })}
        </h4>
        <p className="text-ui-sm text-foreground-subtle">
          {intl.formatMessage({ id: "settings.subagents.modelChain.description" })}
        </p>
      </div>

      {/* 备用模型列表 */}
      <div className="space-y-2">
        <p className="text-ui-sm text-foreground-subtle">
          {intl.formatMessage({ id: "settings.subagents.modelChain.primaryFromAbove" })}
        </p>
        <div className="flex items-center justify-between gap-2">
          <Label>
            {fallbacksLabel}
            <span className="ml-1 text-foreground-subtle">
              {intl.formatMessage(
                { id: "settings.subagents.modelChain.fallbacksLimit" },
                { max: String(MAX_SUBAGENT_MODEL_CHAIN_FALLBACKS) },
              )}
            </span>
          </Label>
          {canAddFallback ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddFallback}
              disabled={disabled}
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
              {intl.formatMessage({ id: "settings.subagents.modelChain.addFallback" })}
            </Button>
          ) : null}
        </div>
        <p className="text-ui-sm text-foreground-subtle">
          {intl.formatMessage({ id: "settings.subagents.modelChain.fallbacksDescription" })}
        </p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={fallbackIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {fallbackRows.map(({ id, fallback, index }) => (
                <SortableFallbackRow
                  key={id}
                  id={id}
                  index={index}
                  total={value.fallbacks.length}
                  fallback={fallback}
                  modelGroups={modelGroups}
                  modelSelectionView={modelSelectionView}
                  modelSelectionLoading={modelSelectionLoading}
                  disabled={disabled}
                  dragHint={dragHint}
                  moveUpLabel={intl.formatMessage(
                    { id: "settings.subagents.modelChain.moveUp" },
                    { index: String(index + 1) },
                  )}
                  moveDownLabel={intl.formatMessage(
                    { id: "settings.subagents.modelChain.moveDown" },
                    { index: String(index + 1) },
                  )}
                  removeLabel={intl.formatMessage(
                    { id: "settings.subagents.modelChain.removeFallback" },
                    { index: String(index + 1) },
                  )}
                  placeholder={intl.formatMessage(
                    { id: "settings.subagents.modelChain.fallbackPlaceholder" },
                    { index: String(index + 1) },
                  )}
                  onChange={(selection) => handleFallbackChange(index, selection)}
                  onMove={(offset) => handleMoveFallback(index, offset)}
                  onRemove={() => handleRemoveFallback(index)}
                  onManageModels={onManageModels}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {value.fallbacks.length === 0 ? (
          <p className="text-ui-sm text-foreground-subtle">
            {intl.formatMessage({ id: "settings.subagents.modelChain.fallbacksEmpty" })}
          </p>
        ) : null}
      </div>

      {/* 重试次数 */}
      <div className="space-y-2">
        <Label htmlFor="subagent-model-chain-retry-count">{retryCountLabel}</Label>
        <Input
          id="subagent-model-chain-retry-count"
          type="number"
          min={1}
          max={10}
          value={value.retryCount}
          onChange={handleRetryCountChange}
          disabled={disabled}
          className="w-24"
        />
        <p className="text-ui-sm text-foreground-subtle">
          {intl.formatMessage(
            { id: "settings.subagents.modelChain.retryCountDescription" },
            { count: String(value.retryCount) },
          )}
        </p>
      </div>
    </div>
  );
}
