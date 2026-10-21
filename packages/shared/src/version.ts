// 由各 bundler 通过 define 注入，避免运行时 JSON import 的跨 bundler 兼容问题。
// 非构建环境（如 e2e 测试的 mocha）下 define 不存在，
// 用 typeof 检查 + fallback 避免 ReferenceError。
declare const __ZCODE_VERSION__: string;
declare const __ZCODE_UPSTREAM_VERSION__: string;
declare const __ZCODE_COMMIT__: string;
declare const __ZCODE_BUILD_TIME__: string;

export const ZCODE_VERSION: string =
  typeof __ZCODE_VERSION__ !== "undefined" ? __ZCODE_VERSION__ : "0.0.0-dev";

/**
 * 本构建所对齐的上游版本（根 package.json 的 version，不含 fork 后缀与 patch 偏移）。
 *
 * 远程控制入口 `/remote/vN` 对 `app_version` 做「官方已发布版本」白名单校验，
 * 而 fork 为了满足 electron-updater 的 semver 比较会写成 `上游patch + 1`（如 3.16.3），
 * 那个版本上游从未发布，网关会直接返回 404「Not Found.」。入口只能上报本值。
 */
export const ZCODE_UPSTREAM_VERSION: string =
  typeof __ZCODE_UPSTREAM_VERSION__ !== "undefined"
    ? __ZCODE_UPSTREAM_VERSION__
    : ZCODE_VERSION;

export const ZCODE_COMMIT: string =
  typeof __ZCODE_COMMIT__ !== "undefined" ? __ZCODE_COMMIT__ : "unknown";
export const ZCODE_BUILD_TIME: string =
  typeof __ZCODE_BUILD_TIME__ !== "undefined" ? __ZCODE_BUILD_TIME__ : "unknown";
