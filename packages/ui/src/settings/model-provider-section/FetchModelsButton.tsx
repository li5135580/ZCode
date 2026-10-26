import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangleIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import type { ModelConfigObject, ProviderApiType } from "@zcode/provider";
import {
  fetchProviderModels,
  resolveModelParameters,
  type FetchedModelInfo,
} from "@zcode/services";
import {
  TID_MODEL_PROVIDER_FETCH_MODELS_BUTTON,
  TID_MODEL_PROVIDER_FETCH_MODELS_CONFIRM,
  TID_MODEL_PROVIDER_FETCH_MODELS_DIALOG,
  TID_MODEL_PROVIDER_FETCH_MODELS_ITEM,
  TID_MODEL_PROVIDER_FETCH_MODELS_STALE_CONFIRM,
  TID_MODEL_PROVIDER_FETCH_MODELS_STALE_INCOMPLETE,
  TID_MODEL_PROVIDER_FETCH_MODELS_STALE_ITEM,
  TID_MODEL_PROVIDER_FETCH_MODELS_STALE_SECTION,
  testId,
} from "@zcode/shared/test-ids";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { ProviderSettingsFormModel } from "@/lib/providerSettingsFormTypes.js";
import { resolveStaleModels } from "@/settings/model-provider-section/staleModelCandidates.js";

/**
 * 把「获取到的模型信息」折算成可提交的稀疏 Personal Model 配置。
 *
 * 只写入**上游 API 确实返回过**的字段。缺失的字段一律保持缺省，交给 Host 的推荐配置
 * 基线解析（`ModelConfigRules.resolve` 按 `modelMatch` 匹配 `zcode-builtin.json`）。
 *
 * 这里刻意不按模型 ID 做本地推断：本地推断表会在上游新增/调整模型时静默漂移，
 * 一旦写入就成了个人覆盖，反而盖住 Host 更准确的基线——典型例子是 glm-5.3 被本地
 * 误判成 200000，而 Host 规则给出 1000000。
 *
 * `reasoningLevels` 不在此处落地：枚举档位必须同时给出 CEL 映射表达式，
 * 而映射与具体供应商接口相关，只能由推荐配置提供。
 */
export function resolveFetchedModelPersonalConfig(model: FetchedModelInfo): ModelConfigObject {
  const resolved = resolveModelParameters(model);
  const properties: Record<string, unknown> = {};
  const optionSpecs: Record<string, unknown> = {};
  if (model.contextWindow !== undefined) {
    properties.contextWindow = resolved.contextWindow;
  }
  if (model.inputFormat !== undefined) {
    properties.inputFormat = { ...resolved.inputFormat };
  }
  if (model.maxOutputTokens !== undefined) {
    optionSpecs.maxOutputTokens = { max: resolved.maxOutputTokens };
  }
  return {
    ...(Object.keys(properties).length > 0 ? { properties } : {}),
    ...(Object.keys(optionSpecs).length > 0 ? { optionSpecs } : {}),
  } as ModelConfigObject;
}

/** 把获取到的模型折算成添加模型链路使用的表单模型。 */
export function toProviderSettingsFormModel(model: FetchedModelInfo): ProviderSettingsFormModel {
  const personalConfig = resolveFetchedModelPersonalConfig(model);
  return {
    kind: "candidate",
    modelId: model.modelId,
    builtin: false,
    // 推荐基线仍由 Host 解析；这里只把已知参数作为显式覆盖写入。
    useRecommendedConfig: true,
    personalConfig,
    config: {},
    hasPersonalConfig: Object.keys(personalConfig).length > 0,
    executable: false,
    selectable: false,
  };
}

export interface FetchModelsButtonProps {
  /** Provider 的 API 形态，决定调用哪个模型列表接口；缺失时走内置配置匹配。 */
  apiKind?: ProviderApiType | null;
  /** Provider 的 API Base URL。 */
  baseUrl?: string | null;
  /** Provider 当前草稿中的 API Key。 */
  apiKey: string;
  /** 缺少 API Key 等前置条件时禁用入口。 */
  disabled?: boolean;
  /** 已配置的模型 ID，用于标记「已添加」并阻止重复提交。 */
  existingModelIds: readonly string[];
  /**
   * 个人添加的模型 ID（不含 builtin）。
   *
   * 内置模型随应用版本更新自动消失，不需要清理；只有个人模型会在上游下架后残留。
   */
  personalModelIds?: readonly string[];
  /** 添加单个模型；复用 Provider 卡片既有的 Personal Model 保存链路。 */
  onAddModel: (model: ProviderSettingsFormModel) => void | Promise<void>;
  /** 删除若干个人模型；不传时不展示「已下架」清理入口。 */
  onRemoveModels?: (modelIds: readonly string[]) => void | Promise<void>;
}

/**
 * 「获取模型列表」入口。
 *
 * 点击后按 Provider 的 API 形态调用 `fetchProviderModels`，在弹窗中列出可添加的模型，
 * 用户勾选后逐个走既有添加链路写入 Personal Model。
 */
export function FetchModelsButton({
  apiKind,
  baseUrl,
  apiKey,
  disabled = false,
  existingModelIds,
  personalModelIds,
  onAddModel,
  onRemoveModels,
}: FetchModelsButtonProps) {
  const { intl } = useZCodeIntl();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<FetchedModelInfo[]>([]);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [removalSelectedIds, setRemovalSelectedIds] = useState<readonly string[]>([]);
  // 用户可能连续点开弹窗；用代数令牌丢弃过期响应，避免旧结果覆盖新一轮列表。
  const requestGenerationRef = useRef(0);
  const addingRef = useRef(false);
  const existingIdSet = useMemo(() => new Set(existingModelIds), [existingModelIds]);
  const selectableModels = useMemo(
    () => models.filter((model) => !existingIdSet.has(model.modelId)),
    [models, existingIdSet],
  );
  // 「已下架」候选：个人添加、但本次获取没返回的模型。默认不勾选，必须用户显式确认。
  const staleModels = useMemo(
    () =>
      resolveStaleModels({
        fetchedModels: models,
        personalModelIds: personalModelIds ?? [],
      }),
    [models, personalModelIds],
  );
  // 模型被删掉后候选会自动消失；这里再夹一层，避免残留的选中项指向已删除的模型。
  const removableSelectedIds = useMemo(
    () => removalSelectedIds.filter((modelId) => staleModels.modelIds.includes(modelId)),
    [removalSelectedIds, staleModels.modelIds],
  );

  const loadModels = useCallback(async () => {
    const generation = ++requestGenerationRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchProviderModels(
        { apiKind: apiKind ?? null, baseUrl: baseUrl ?? null },
        apiKey,
      );
      if (requestGenerationRef.current !== generation) return;
      if (!result.success) {
        setModels([]);
        setSelectedIds([]);
        setRemovalSelectedIds([]);
        setError(result.error ?? intl.formatMessage({ id: "settings.modelProvider.fetchModelsFailed" }));
        return;
      }
      setModels(result.models);
      setSelectedIds([]);
      setRemovalSelectedIds([]);
      if (result.models.length === 0) {
        // 内置兜底路径返回成功但列表为空（error 字段携带内部说明），
        // 这里只给用户可执行的提示，不把内部英文文案直接抛到界面上。
        setError(
          intl.formatMessage({ id: "settings.modelProvider.fetchModelsUnsupported" }),
        );
      }
    } catch (caught) {
      if (requestGenerationRef.current !== generation) return;
      setModels([]);
      setSelectedIds([]);
      setRemovalSelectedIds([]);
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (requestGenerationRef.current === generation) setLoading(false);
    }
  }, [apiKey, apiKind, baseUrl, intl]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      // 添加/删除过程中关闭会让逐个提交的循环失去可见反馈，等待本次提交结束再结束弹窗。
      if (addingRef.current || removing) return;
      setOpen(next);
      if (!next) {
        requestGenerationRef.current += 1;
        setModels([]);
        setSelectedIds([]);
        setRemovalSelectedIds([]);
        setError(null);
        setLoading(false);
        return;
      }
      void loadModels();
    },
    [loadModels, removing],
  );

  const toggleModel = (modelId: string) => {
    setSelectedIds((current) =>
      current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId],
    );
  };

  const toggleRemovalModel = (modelId: string) => {
    setRemovalSelectedIds((current) =>
      current.includes(modelId)
        ? current.filter((id) => id !== modelId)
        : [...current, modelId],
    );
  };

  const allSelected =
    selectableModels.length > 0 && selectedIds.length === selectableModels.length;
  const allRemovalSelected =
    staleModels.modelIds.length > 0 &&
    removableSelectedIds.length === staleModels.modelIds.length;

  const confirmRemove = useCallback(async () => {
    if (removing || !onRemoveModels) return;
    const targets = [...removableSelectedIds];
    if (targets.length === 0) return;
    setRemoving(true);
    setError(null);
    try {
      await onRemoveModels(targets);
      // 删除后 personalModelIds 会随 Settings View 刷新而收缩，
      // 候选列表随之变短；这里清空选中，避免残留指向已删除的模型。
      setRemovalSelectedIds([]);
    } catch (caught) {
      setError(
        intl.formatMessage(
          { id: "settings.modelProvider.fetchModelsRemoveFailed" },
          { error: caught instanceof Error ? caught.message : String(caught) },
        ),
      );
    } finally {
      setRemoving(false);
    }
  }, [intl, onRemoveModels, removableSelectedIds, removing]);

  const confirmAdd = useCallback(async () => {
    if (addingRef.current) return;
    const targets = models.filter(
      (model) => selectedIds.includes(model.modelId) && !existingIdSet.has(model.modelId),
    );
    if (targets.length === 0) return;
    addingRef.current = true;
    setAdding(true);
    setError(null);
    const failedIds: string[] = [];
    const failureMessages: string[] = [];
    for (const target of targets) {
      try {
        await onAddModel(toProviderSettingsFormModel(target));
      } catch (caught) {
        failedIds.push(target.modelId);
        failureMessages.push(caught instanceof Error ? caught.message : String(caught));
      }
    }
    addingRef.current = false;
    setAdding(false);
    if (failedIds.length > 0) {
      // 已成功的模型会通过 View 刷新变成「已添加」，只保留失败项的勾选便于重试。
      setSelectedIds(failedIds);
      setError(
        intl.formatMessage(
          { id: "settings.modelProvider.fetchModelsPartialFailure" },
          { error: failureMessages[0] ?? "" },
        ),
      );
      return;
    }
    handleOpenChange(false);
  }, [existingIdSet, handleOpenChange, intl, models, onAddModel, selectedIds]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        type="button"
        variant="secondary"
        size="default"
        className="rounded-lg"
        data-testid={TID_MODEL_PROVIDER_FETCH_MODELS_BUTTON}
        disabled={disabled}
        onClick={() => handleOpenChange(true)}
      >
        <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
        {intl.formatMessage({ id: "settings.modelProvider.fetchModels" })}
      </Button>
      <DialogContent
        data-testid={TID_MODEL_PROVIDER_FETCH_MODELS_DIALOG}
        className="max-h-[min(40rem,calc(100vh-4rem))] max-w-xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-clip"
      >
        <DialogHeader>
          <DialogTitle className="truncate">
            {intl.formatMessage({ id: "settings.modelProvider.fetchModels" })}
          </DialogTitle>
          <DialogDescription>
            {intl.formatMessage({ id: "settings.modelProvider.fetchModelsDescription" })}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 min-w-0 space-y-3 overflow-y-auto" inert={adding || removing}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-ui-base text-foreground-subtle">
              {loading
                ? intl.formatMessage({ id: "settings.modelProvider.fetchModelsLoading" })
                : intl.formatMessage(
                    { id: "settings.modelProvider.fetchModelsCount" },
                    { count: selectableModels.length },
                  )}
            </span>
            <div className="flex items-center gap-2">
              {selectableModels.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={loading}
                  onClick={() =>
                    setSelectedIds(allSelected ? [] : selectableModels.map((m) => m.modelId))
                  }
                >
                  {intl.formatMessage({
                    id: allSelected
                      ? "settings.modelProvider.fetchModelsClearSelection"
                      : "settings.modelProvider.fetchModelsSelectAll",
                  })}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => void loadModels()}
              >
                <RefreshCwIcon aria-hidden="true" />
                {intl.formatMessage({ id: "settings.modelProvider.fetchModelsRetry" })}
              </Button>
            </div>
          </div>
          {loading ? (
            <div className="flex h-24 items-center justify-center" role="status">
              <Loader2Icon className="size-4 animate-spin text-foreground-subtle" aria-hidden="true" />
              <span className="sr-only">{intl.formatMessage({ id: "common.loading" })}</span>
            </div>
          ) : models.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-ui-base text-foreground-subtle">
              {intl.formatMessage({ id: "settings.modelProvider.fetchModelsEmpty" })}
            </div>
          ) : (
            <ul className="overflow-hidden rounded-lg border border-input-border bg-input">
              {models.map((model) => {
                const added = existingIdSet.has(model.modelId);
                return (
                  <li
                    key={model.modelId}
                    data-testid={testId(TID_MODEL_PROVIDER_FETCH_MODELS_ITEM, model.modelId)}
                    className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <Checkbox
                      checked={selectedIds.includes(model.modelId)}
                      disabled={added}
                      aria-label={model.modelId}
                      onCheckedChange={() => toggleModel(model.modelId)}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-ui-base">
                      {model.modelId}
                    </span>
                    {added ? (
                      <span className="shrink-0 text-ui-sm text-foreground-subtlest">
                        {intl.formatMessage({
                          id: "settings.modelProvider.fetchModelsAlreadyAdded",
                        })}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {staleModels.available && onRemoveModels ? (
            // 「已下架」候选：个人添加、但本次获取没返回的模型。
            // 默认不勾选——获取结果不一定完整（分页、权限过滤、临时故障），
            // 自动删除会连带丢掉用户手调的 contextWindow 等个人参数。
            <section
              data-testid={TID_MODEL_PROVIDER_FETCH_MODELS_STALE_SECTION}
              className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3"
            >
              <div className="flex items-start gap-2">
                <AlertTriangleIcon
                  className="mt-0.5 size-4 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-ui-base font-medium text-foreground">
                    {intl.formatMessage(
                      { id: "settings.modelProvider.fetchModelsStaleTitle" },
                      { count: staleModels.modelIds.length },
                    )}
                  </div>
                  <p className="text-ui-sm leading-4 text-foreground-subtle">
                    {intl.formatMessage({ id: "settings.modelProvider.fetchModelsStaleHint" })}
                  </p>
                  {staleModels.looksIncomplete ? (
                    <p
                      data-testid={TID_MODEL_PROVIDER_FETCH_MODELS_STALE_INCOMPLETE}
                      className="text-ui-sm leading-4 text-warning"
                    >
                      {intl.formatMessage({
                        id: "settings.modelProvider.fetchModelsStaleIncomplete",
                      })}
                    </p>
                  ) : null}
                </div>
              </div>
              <ul className="overflow-hidden rounded-lg border border-input-border bg-input">
                {staleModels.modelIds.map((modelId) => (
                  <li
                    key={modelId}
                    data-testid={testId(TID_MODEL_PROVIDER_FETCH_MODELS_STALE_ITEM, modelId)}
                    className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <Checkbox
                      checked={removableSelectedIds.includes(modelId)}
                      disabled={removing}
                      aria-label={modelId}
                      onCheckedChange={() => toggleRemovalModel(modelId)}
                    />
                    <span className="min-w-0 flex-1 truncate font-mono text-ui-base">
                      {modelId}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={removing}
                  onClick={() =>
                    setRemovalSelectedIds(
                      allRemovalSelected ? [] : [...staleModels.modelIds],
                    )
                  }
                >
                  {intl.formatMessage({
                    id: allRemovalSelected
                      ? "settings.modelProvider.fetchModelsClearSelection"
                      : "settings.modelProvider.fetchModelsSelectAll",
                  })}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  data-testid={TID_MODEL_PROVIDER_FETCH_MODELS_STALE_CONFIRM}
                  disabled={removing || removableSelectedIds.length === 0}
                  onClick={() => void confirmRemove()}
                >
                  {removing ? (
                    <Loader2Icon className="animate-spin" aria-hidden="true" />
                  ) : null}
                  {intl.formatMessage(
                    { id: "settings.modelProvider.fetchModelsStaleRemove" },
                    { count: removableSelectedIds.length },
                  )}
                </Button>
              </div>
            </section>
          ) : null}
          {error ? (
            <p role="alert" className="text-ui-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={adding || removing}
            onClick={() => handleOpenChange(false)}
          >
            {intl.formatMessage({ id: "common.cancel" })}
          </Button>
          <Button
            type="button"
            data-testid={TID_MODEL_PROVIDER_FETCH_MODELS_CONFIRM}
            disabled={adding || removing || loading || selectedIds.length === 0}
            onClick={() => void confirmAdd()}
          >
            {adding ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
            {intl.formatMessage(
              { id: "settings.modelProvider.fetchModelsAddSelected" },
              { count: selectedIds.length },
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
