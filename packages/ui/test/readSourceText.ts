import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

// 二开保留：上游 v3.17.1 退役 App 业务单测时删掉了这份 helper，但二开的
// subagentsModelChainMounting.test.ts 仍用它读源码做契约断言，因此重新加回。
//
// Bugfix 原因：Windows 检出（core.autocrlf=true）的工作区文本是 CRLF，而源码契约
// 断言统一以 LF 书写；多行 toContain / indexOf 边界在 CRLF 文本上必然失配，
// 表现为"片段存在但断言失败"。契约测试读取源码一律经由这里做换行归一化。
export function readSourceText(path: string | URL, encoding: BufferEncoding = "utf8"): string {
  return readFileSync(path, encoding).replace(/\r\n/g, "\n");
}

export async function readSourceTextAsync(
  path: string | URL,
  encoding: BufferEncoding = "utf8",
): Promise<string> {
  return (await readFile(path, encoding)).replace(/\r\n/g, "\n");
}
