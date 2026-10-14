/**
 * 模型链失败类型
 */
export enum ModelChainFailureType {
  /** API 错误（如 429、500） */
  ApiError = "api_error",
  /** 超时 */
  Timeout = "timeout",
  /** 内容审核 */
  ContentFilter = "content_filter",
  /** 网络错误 */
  NetworkError = "network_error",
  /** 配额不足 */
  QuotaExceeded = "quota_exceeded",
  /** 未知错误 */
  Unknown = "unknown",
}

/**
 * 失败判定结果
 */
export interface FailureDetectionResult {
  isFailure: boolean;
  type: ModelChainFailureType;
  retryable: boolean;
  message?: string;
}

/**
 * 判定错误是否为失败
 */
export function detectFailure(error: unknown): FailureDetectionResult {
  // 空错误不算失败
  if (!error) {
    return {
      isFailure: false,
      type: ModelChainFailureType.Unknown,
      retryable: false,
    };
  }

  // 网络错误
  if (isNetworkError(error)) {
    return {
      isFailure: true,
      type: ModelChainFailureType.NetworkError,
      retryable: true,
      message: getErrorMessage(error),
    };
  }

  // 超时
  if (isTimeoutError(error)) {
    return {
      isFailure: true,
      type: ModelChainFailureType.Timeout,
      retryable: true,
      message: getErrorMessage(error),
    };
  }

  // API 错误
  if (isApiError(error)) {
    const statusCode = getStatusCode(error);

    // 内容审核
    if (statusCode === 400 || statusCode === 422) {
      return {
        isFailure: true,
        type: ModelChainFailureType.ContentFilter,
        retryable: false,
        message: getErrorMessage(error),
      };
    }

    // 配额不足
    if (statusCode === 429) {
      return {
        isFailure: true,
        type: ModelChainFailureType.QuotaExceeded,
        retryable: true,
        message: getErrorMessage(error),
      };
    }

    // 服务器错误
    if (statusCode && statusCode >= 500) {
      return {
        isFailure: true,
        type: ModelChainFailureType.ApiError,
        retryable: true,
        message: getErrorMessage(error),
      };
    }
  }

  // 未知错误
  return {
    isFailure: true,
    type: ModelChainFailureType.Unknown,
    retryable: true,
    message: getErrorMessage(error),
  };
}

/**
 * 判断是否为网络错误
 */
function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("network") ||
    message.includes("econnrefused") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("socket")
  );
}

/**
 * 判断是否为超时错误
 */
function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("timeout") || message.includes("timed out");
}

/**
 * 判断是否为 API 错误
 */
function isApiError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return "statusCode" in error || "status" in error;
}

/**
 * 获取 HTTP 状态码
 */
function getStatusCode(error: unknown): number | undefined {
  if (!(error instanceof Error)) return undefined;
  if ("statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode;
  }
  if ("status" in error && typeof error.status === "number") {
    return error.status;
  }
  return undefined;
}

/**
 * 获取错误消息
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * 判断是否应该重试
 */
export function shouldRetry(result: FailureDetectionResult, retryCount: number): boolean {
  return result.isFailure && result.retryable && retryCount > 0;
}