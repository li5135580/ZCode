cmake_minimum_required(VERSION 3.21)

cmake_policy(SET CMP0091 NEW)
project(zcode_preinstalled_entry_shim LANGUAGES C)

if(NOT DEFINED ZCODE_SHIM_OUTPUT_DIR)
  message(FATAL_ERROR "Missing ZCODE_SHIM_OUTPUT_DIR")
endif()

if(MSVC)
  # 静态链接 C 运行库：shim 复制到预装 bin 目录后独立运行，不依赖目标机器的 VC++ 运行库。
  set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

add_executable(zcode-preinstalled-entry-shim shim.c)
target_compile_definitions(zcode-preinstalled-entry-shim PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN)
if(MSVC)
  # /Brepro 去掉时间戳，同一源码产出相同字节；入口是否需要替换按 SHA-256 判断。
  target_compile_options(zcode-preinstalled-entry-shim PRIVATE /W4 /WX /utf-8 /guard:cf /Brepro)
  target_link_options(zcode-preinstalled-entry-shim PRIVATE /GUARD:CF /Brepro /SUBSYSTEM:CONSOLE)
else()
  # 非 MSVC 走 MinGW 兜底：GitHub 的 windows-latest 镜像已不再预装 Visual Studio，只支持 MSVC
  # 会让构建直接失败（runtime-host 在 2026-11-16 就这样失败过）。这里给出与 MSVC 分支等价的语义：
  # -municode 让运行库调用 shim.c 的 wmain 入口；-static 静态链接运行库（对应 /MT）；
  # --subsystem,console 对应 /SUBSYSTEM:CONSOLE；--no-insert-timestamp 对应 /Brepro 的
  # 「同一源码产出相同字节」，否则 PE 头会写入构建时间，重复构建永远被判为已变更。
  # MinGW 头文件默认的 _WIN32_WINNT 较低，不提升就拿不到 PROC_THREAD_ATTRIBUTE_JOB_LIST。
  target_compile_definitions(zcode-preinstalled-entry-shim PRIVATE _WIN32_WINNT=0x0A00)
  target_compile_options(zcode-preinstalled-entry-shim PRIVATE -Wall -Wextra -Werror)
  target_link_options(zcode-preinstalled-entry-shim PRIVATE
    -municode -static -Wl,--subsystem,console,--no-insert-timestamp)
endif()
set_target_properties(zcode-preinstalled-entry-shim PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${ZCODE_SHIM_OUTPUT_DIR}"
  RUNTIME_OUTPUT_DIRECTORY_RELEASE "${ZCODE_SHIM_OUTPUT_DIR}"
)
