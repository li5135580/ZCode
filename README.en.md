# ZCode (Enhanced Fork)

<div align="center">
  <img src="public/logo/icons/1024x1024.png" alt="ZCode" width="128" height="128" />
</div>
<p align="center">
  <a href="https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=47ag983c-8fcb-4d6d-814b-5395193a712c&amp;qr_code=true">Feishu community</a> ·
  <a href="https://discord.gg/z9aBcQXZQ3">Discord</a>
</p>
<p align="center">
  <a href="README.md">简体中文</a> | English
</p>

> **This is an enhanced fork of ZCode**, based on [zai-org/ZCode](https://github.com/zai-org/ZCode), with the following enhancements:

## ✨ Enhanced Features

### 1. Subagent Multi-Model Chain Support

- **Multi-Model Binding**: Each subagent can configure any number of fallback models
  (no product limit, 20 as a safety cap)
- **Primary Model Reuse**: When the model chain is enabled, the primary model comes from the
  Model field above; the chain only configures fallbacks
- **Drag to Reorder**: Fallbacks are tried top to bottom; drag the handle or use the
  move up/down buttons to change priority
- **Independent Reasoning Levels**: Each model can have its own reasoning level
- **Smart Fallback**: Execute in order. After a model fails it retries the same model according to
  `retryCount` (default 5, i.e. five retries on top of the first attempt) and only moves to the next
  fallback once that budget is exhausted; selection/config errors skip retrying and switch at once
- **Resume Instead of Restart**: Switching models no longer redoes finished work. Tool calls and
  results from the failed attempt are kept; tools that never finished are marked as "not executed"
  or "side effects unknown". The new model also gets a note saying the earlier history came from a
  previous attempt — do not assume its reasoning was right, and do not redo what already succeeded
- **Main Agent Fallback**: Falls back to main agent when all models fail

**Configuration Example** (Markdown frontmatter):

```yaml
---
name: my-agent
description: My custom subagent
modelChain:
  primary:
    providerId: zai
    modelId: glm-4.6
    reasoningLevel: high
  fallbacks:
    - providerId: openai
      modelId: gpt-5
      reasoningLevel: medium
    - providerId: anthropic
      modelId: claude-4
      reasoningLevel: low
  retryCount: 5
---
```

### 2. Automatic Model Fetching

- **Auto-fetch Upstream Models**: Automatically fetch model lists from [OI], Anthropic, Z.AI,
  and other providers
- **Capability Metadata First**: When `/models` returns `context_length`,
  `max_completion_tokens`, or `architecture.input_modalities`, those values are used directly
  (strictly type-checked; invalid values are ignored)
- **Variant Name Recognition**: The host rule table covers hyphenated names (`gpt-5-6-*`),
  `-preview` suffixes, explicit `[1m]` declarations, `claude-4` / `claude-3.5`,
  `qwen3-vl-flash`, and similar variants
- **One-click Add**: Add fetched models with one click in the model settings page
- **Stale Model Cleanup**: When a provider drops models, re-fetching shows a "no longer offered"
  section at the bottom of the dialog, listing personally-added models the latest fetch did not
  return. Nothing is pre-selected — tick and delete deliberately. The section only appears when
  every entry came from a real API response (builtin-config matches and the Anthropic hard-coded
  fallback never expose it), so hand-tuned context windows are not silently removed

### 3. Conversation Selection Notes

> This became an **upstream-native feature** in v4.0.0 (selection "Notes"); the fork no longer
> maintains its own implementation.

- **Select and note**: Select an assistant reply or preview text and click "Note". The comment is
  optional — leaving it blank is the same as quoting the text alone
- **Numbered against the body**: Multiple quotes are numbered in the composer and mapped to markers
  in the message; clicking a number jumps back to edit
- **Undoable removal**: Removing a note offers undo, so a mis-click does not require re-selecting
- **Limits**: Up to 8 notes, 16000 characters in total (upstream spec)

### 4. Usage Status Bar Under the Composer

A lightweight row sits permanently along the composer edge, **sharing one line** with upstream's
background-activity / goal / todo capsules (merged in v4.0.0):

| Metric | Meaning | Source |
| --- | --- | --- |
| Context | Context usage percentage plus a progress bar | Session snapshot `usage.contextWindow` |
| Speed | Measured generation rate of the current turn (tok/s) | Turn detail `duration_ms` − `time_to_first_token_ms` |
| Turn | Input / output tokens of this turn, with cache hit rate, duration, segments | Turn detail `turn_usage` |
| Session | Cumulative input / output, cache hit rate, request count | Session snapshot `usage.cumulative` |
| Subagents | Running / finished subagent counts | Runtime task registry |
| Tools | Tool calls in this turn | Session snapshot |
| Today | Tokens across all sessions today plus turns | Local usage DB, aggregated per day from `model_usage` |

- **Speed only shows measured values**: when it cannot be measured (buffered SSE, missing TTFT,
  cross-segment joins) the bar shows `—` instead of estimating from wall-clock time, so the
  five-digit false rates are gone
- **Icons follow state colours**: speed and context have three tiers (normal / elevated / alert),
  and their icon is coloured like the value; the cache hit rate has no icon of its own but its
  number is tiered the same way. Without a measured value the icon stays neutral grey so "unknown"
  is not read as "fast"
- **Seven independently toggleable items**: each can be switched off in Settings, font size is
  configurable (12px default), the row is centred and wraps on narrow windows
- **Fully local**: Reads the local SQLite database only — nothing is uploaded or fetched
- **Draft state**: With no session yet only the upstream capsules show; the bar appears after the
  first message

### 5. One-Click Restart Next to the Help Button

- **Location**: A standalone icon button **left of the Help button** in the title bar (with a
  hover hint) — not inside the menu
- **Behaviour**: Full restart (`prepareAppQuit` → `app.relaunch`), the same as quitting and
  starting again by hand
- **Use case**: Settings, model or plugin changes that only take effect after a restart
- **Different from "Restart to update"**: that one installs an update; this one unconditionally
  restarts the process

### 6. Update Dialog Shows Release Notes Directly

- **Problem**: upstream's update dialog is a fixed-height window whose notes row was squeezed to
  zero, so the changelog was only visible in a hover tooltip
- **Now**: a dedicated "has release notes" height tier (460px) lets you read the full notes right
  after opening the update button; during download it stays compact (the progress bar is the
  relevant information then)
- **Source**: CI injects `RELEASE-NOTES.md` into each platform manifest, so the dialog and the
  Release body share one source

### 7. GitHub Actions Auto Sync & Release

- **Auto Sync Upstream**: Checks upstream once a day and merges automatically (custom commits are
  preserved by git). Conflicts touching non-README files open an Issue
- **Auto Build & Release**: Pushing a tag builds all three platforms and publishes the release
  (Windows / macOS arm64 / Linux)
- **Test Gate**: Every push/PR to main runs `pnpm typecheck` and the engineering test whitelist
  (which includes all of this fork's own cases)

> Sync used to run hourly; after 278 runs GitHub rate-limited Actions on this fork and silently
> stopped every workflow. It is now daily.

### 8. Custom Update Source & Manual Check

- **Update Source Switch**: Client update detection source points at this repository's GitHub Releases
- **Manual Check**: Available from the app menu, tray, and Help menu — including the Preview build
- **Environment Variable Override**: Support custom update source via `ZCODE_UPDATE_FEED_URL`

### 9. Other Reliability Fixes

- **Login credentials survive upgrades**: the installer bundles the `@napi-rs/keyring` native binary
  and asserts it after packaging, so "lost login after upgrade, cannot sign in again" no longer happens
- **Cross-provider thinking isolation**: when history from provider A is sent to a model from
  provider B, A's reasoning is stripped (including `openai-compatible` custom endpoints), while
  same-provider same-model retries keep the full thinking chain
- **Remote control entry version**: the entry reports the upstream baseline version, so fork patch
  versions are not rejected by the gateway whitelist (which caused a blank mobile page / 404)

---

## 📦 Installation

### Option 1: Download the installer (Recommended)

**For users who want to try the enhanced features without building from source**

Download the package for your platform from this repository's
[Releases](https://github.com/li5135580/ZCode/releases/latest):

| Platform | Artifact | Notes |
| --- | --- | --- |
| Windows x64 | `ZCode-Preview-<version>-win-x64.exe` | NSIS installer |
| macOS arm64 | `ZCode-Preview-<version>-mac-arm64.dmg` | Apple Silicon; unsigned, requires manual Gatekeeper approval |
| Linux x64 | `ZCode-Preview-<version>-linux-x86_64.AppImage` | Portable; `chmod +x` then run. Also the auto-update artifact format |
| Linux x64 | `ZCode-Preview-<version>-linux-amd64.deb` | Debian/Ubuntu first install; auto-update still uses the AppImage |

The installer is **built from this fork's source by CI** (not a patch applied on top of the
official package), so the enhanced features are already included:

- Subagent model chains (including resume after a mid-run failure)
- Automatic model fetching plus stale model cleanup
- Usage status bar under the composer (seven metrics, one line with upstream capsules)
- One-click restart next to the Help button
- Release notes shown directly in the update dialog
- Update source pointing at this repository's Releases

**Notes**:

- The installer uses the **Preview identity** (app name `ZCode Preview`, separate data
  directory), so it installs side by side with the official ZCode without overwriting it.
- The installer is **not code-signed**. Windows may show a SmartScreen prompt on first run;
  choose "More info → Run anyway". If you run third-party antivirus software (e.g. Huorong),
  the first launch can be slower than usual while it scans the newly written files — this is
  expected.
- **macOS ships arm64 only**: Intel Macs are no longer sold and get no separate build. The
  artifact carries only an ad-hoc signature (required on Apple Silicon), with no Developer ID
  signature or notarization, so Gatekeeper blocks the first launch. Right-click → Open, or run
  `xattr -rd com.apple.quarantine "/Applications/ZCode Preview.app"`.
- **Linux ships AppImage and deb only**: rpm/pacman need extra packaging tools on the build
  machine and are not part of CI.
- **Auto-update works**: the update feed points at this repository's Releases and can be
  checked manually from the app menu, tray, or Help menu. Each platform reads its own update
  manifest (Windows `latest.yml`, macOS `latest-mac.yml`, Linux `latest-linux.yml`). The
  installer version is injected at build time (`<upstream patch+1>-fork.N`, e.g. tag
  `v4.0.0-fork.2` produces `4.0.1-fork.2`); within one upstream version a higher fork number is newer.
- **Upgrading from a 3.15.1 build needs one manual step**: that build's updater was never
  initialized, so download the new installer and install over it. Auto-update takes effect
  from that version onward.

### Option 2: Build from Source

**For users who want to customize features or contribute to development**

**Steps**:

```bash
# 1. Clone repository
git clone https://github.com/li5135580/ZCode.git
cd ZCode

# 2. Install dependencies
pnpm install

# 3. Build
pnpm build:zcode

# 4. Run
pnpm dev:desktop
```

> ⚠️ Local builds are path-sensitive: when the repository lives under a path containing
> **non-ASCII characters** (e.g. Chinese), Node's `fs.cpSync` hits a known Windows unlink bug
> (reports "The operation completed successfully" while actually failing) and stalls at
> `prepare:agent-bundle`. Use a pure-ASCII path, or rely on the CI build instead.
>
> ⚠️ **Windows builds need a C++ toolchain**: packaging first compiles three native helpers
> (`zcode-runtime-host`, `zcode-installer-process-helper`, `zcode-preinstalled-entry-shim`).
> With Visual Studio (C++ workload installed) the MSVC generator is used; without it you need
> CMake plus MinGW-w64 (`x86_64-w64-mingw32-gcc` on `PATH`) and the scripts fall back to the
> MinGW generator. The MinGW fallback is x64 only — arm64 still requires MSVC.
>
> ⚠️ When the dependency tree no longer matches the lockfile, `pnpm install` has to rebuild all
> of `node_modules` and aborts in a non-interactive terminal
> (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). In CI or scripts use
> `CI=true pnpm install --frozen-lockfile --child-concurrency=1`.

---

## Original Description

ZCode is an AI coding workspace with desktop, browser, and terminal interfaces. This repository contains the clients, backend services, shared UI, and Agent CLI and runtime source code.

## Updates

- 2026-11-23: Synced to upstream v4.0.0.
- 2026-11-16: Synced to upstream v3.18.2.
- 2026-11-03: Synced to upstream v3.17.2.
- 2026-10-30: Synced to upstream v3.17.1.
- 2026-10-21: Synced to upstream v3.16.2; added a "Restart ZCode" entry to the Help menu; the
  usage status bar now only shows measured generation speed (shows `—` when it cannot be
  measured), fixing a distortion that previously reported tens of thousands of tok/s.
- 2026-10-19: Synced to upstream v3.16.1 (subagent session management, tool search, and other
  upstream updates); all fork enhancements preserved. The repository version now matches
  upstream.
- 2026-10-18 (fork.6): Added macOS (arm64) and Linux (AppImage + deb) clients; the update
  manifest is now selected per platform.
- 2026-10-17 (fork.3): Model chain layout (primary comes from the Model field, fallbacks only,
  drag to reorder, no fixed 2-model limit); model capability metadata parsing plus host rule
  fixes for variant names; manual update check restored with `latest.yml` publishing;
  per-quote annotations for multi-spot corrections.
- 2026-10-17: Fixed "fetch model list" writing a wrong context window size (glm-5.3 was
  recorded as 200k while it is actually 1M), and fixed the upstream sync workflow failing
  every hour.
- 2026-10-14: Enhanced version released, adding subagent multi-model chain, automatic model fetching, GitHub Actions auto sync, and more.
- 2026-10-10: Updated to ZCode v3.15.1.
- 2026-9-23: Updated to ZCode v3.14.3.

## Setup

Install Git, Node.js **24.14.0**, and pnpm **10.33.2**. [mise.toml](mise.toml) is the source of truth for tool versions. Run all development and packaging commands below from the repository root.

```bash
pnpm bootstrap
```

`pnpm bootstrap` installs workspace dependencies, prepares local desktop runtime assets, and runs `build:bootstrap`.

The Agent CLI and runtime source code lives in [apps/zcode-cli/](apps/zcode-cli/) as a regular directory included when you clone this repository. No separate checkout or Git submodule initialization is required.

Additional setup and build commands:

| Command                        | Purpose                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                 | Install dependencies                                                                                                                |
| `pnpm prepare:desktop-runtime` | Prepare desktop runtime assets, including remote assets by default                                                                  |
| `pnpm prepare:remote-assets`   | Prepare remote runtime assets separately                                                                                            |
| `pnpm bootstrap:with-remote`   | Set up dependencies and local and remote assets, then build the relevant packages sequentially; skip the desktop application bundle |
| `pnpm build`                   | Recursively run each workspace package's build script, including its asset preparation steps                                        |

The default `bootstrap` skips remote asset preparation and is suitable for local desktop development. Run the corresponding preparation command when working with remote workspaces or validating remote distribution assets.

## Development and Usage

### Desktop

```bash
pnpm dev:desktop

# Use the test environment
pnpm dev:desktop:test
```

`pnpm dev:desktop` defaults to `pnpm dev:desktop:prod` and uses production service configuration. The startup script prepares local runtime assets, builds the desktop Agent, then starts Electron and source watchers.

Set `ZCODE_DATA_BASE_DIR` to use a separate development data directory. For example, on macOS / Linux:

```bash
ZCODE_DATA_BASE_DIR="$HOME/.zcode-dev-home" pnpm dev:desktop:test
```

### Web Development

Use development mode when editing Web or backend source code:

```bash
pnpm dev:web

# Set the backend workspace (macOS / Linux)
ZCODE_SERVER_WORKSPACE=/path/to/project pnpm dev:web
```

This starts both the Web development server (default: `http://localhost:5173`) and the backend (default: `http://localhost:3030`). Open the Web development server in your browser. `/ws` and general `/api` requests are proxied to the local backend; `/api/v1/oauth/token` is proxied separately to the configured product service.

After changing Agent source code, run `pnpm --filter @zcode/cli... build` and restart the service. To validate the complete distribution, extract and run it as described under Packaging → ZCode CLI distribution below.

### ZCode CLI distribution

The command-line distribution includes the TUI, Web client, and Agent behind one `zcode` command. With no arguments it starts the TUI; a leading `--web` starts Web mode; all other arguments go to the existing Agent CLI. Both modes run locally without Electron.

```bash
# Start the terminal UI by default
zcode

# Start the Web interface
zcode --web

# Set the project and port without opening a browser automatically
zcode --web --workspace /path/to/project --port 3030 --no-open

# Show CLI or Web options
zcode --help
zcode --web --help
```

In Web mode, it uses the current directory as the workspace, listens on `127.0.0.1` without token authentication by default, selects an available port, and opens a browser. Use the URL printed in the terminal and press `Ctrl+C` to stop the service. For LAN access, use `--host 0.0.0.0`; listening on a non-local address generates an access token by default. Use the token-bearing URL printed in the terminal. Set a token with `--token`, or disable token authentication with `--no-token`.

When starting the general Web service's HTTP entry directly, configure API/WebSocket authentication with `ZCODE_SERVER_AUTH_TOKEN`. When creating the service programmatically, use the `authToken` option.

See Packaging below for build instructions. `pnpm build:zcode` only creates the distribution; it does not replace an existing `zcode` on `PATH`. If the command still points to an older installation or another checkout, check it with `command -v zcode` on macOS / Linux or `where.exe zcode` on Windows.

### CLI Source Development

See the [CLI usage guide (Chinese)](apps/zcode-cli/docs/usage/README.md) for model configuration, non-interactive runs, tools and extensions, batch evaluation, and trajectory capture.

Use the source entry when developing the TUI or Agent:

```bash
pnpm --filter @zcode/cli dev --help
pnpm --filter @zcode/cli dev

# Build the CLI and its workspace dependencies
pnpm --filter @zcode/cli... build
node apps/zcode-cli/packages/cli/dist/zcode.cjs --help
```

This entry runs the Agent CLI directly and does not handle the distribution's `--web` switch. Use `pnpm dev:web` for Web development, or the extracted `bin/zcode.mjs` shown below to test the unified command.

### UI Plugin development

See the [UI Plugin guide](UI_PLUGIN.en.md) for the Excalidraw workflow, supported APIs, plugin installation and updates, and host debugging.

**Plugin PRs in `zcode-plugins` must declare whether they affect a UI Plugin and list the plugin names in the PR template.** See the [required plugin-type declaration](UI_PLUGIN.en.md#declare-the-plugin-type-in-pull-requests).

## Configuration

The root [.env.example](.env.example) provides sample service URLs and build configuration. Copy it to `.env` as needed and place local overrides in `.env.local`. Select the Desktop development environment with `dev:desktop:test` or `dev:desktop:prod`.

| Setting                              | Purpose                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| `ZCODE_DATA_BASE_DIR`                | Base directory for application data, stored under its `.zcode/` subdirectory            |
| `ZCODE_SERVER_WORKSPACE`             | Workspace path for the Web backend                                                      |
| `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` | Path to a local provider configuration file; uses the built-in configuration when unset |
| `ZCODE_DIST_BASE_URL`                | Download base URL used by the CLI distribution installer                                |

Runtime variables can be set explicitly in the environment of the startup command. See [config/README.md](config/README.md) for the default configuration shipped with the client.

## Packaging

See [third-party/README.md](third-party/README.md) for notice generation, distribution checks, and where the notices are included in each distribution.

### Desktop

```bash
pnpm bundle:desktop

# Set the target platform and CPU architecture
pnpm bundle:desktop -- --os win --arch x64

pnpm bundle:desktop -- --help
```

The default target is macOS arm64, and the default output directory is `packages/desktop/dist/`. `--os` accepts `mac`, `win`, or `linux`; `--arch` accepts `x64` or `arm64`. Packaging and signing require the tools and configuration for the target platform.

Linux produces AppImage, deb, rpm, and pacman by default. CI builds only the first two (rpm needs `rpmbuild` and `xz`, pacman needs extra tooling), which can be narrowed with an environment variable:

```bash
# AppImage and deb only
ZCODE_LINUX_TARGETS="AppImage,deb" pnpm bundle:desktop -- --os linux --arch x64
```

Without a real signing identity (`ZCODE_ENABLE_MAC_SIGN` plus an identity), arm64 artifacts fall
back to an ad-hoc signature — Apple Silicon refuses to run unsigned Mach-O binaries, so this
layer cannot be skipped.

### ZCode CLI distribution

Run `pnpm build:zcode` to build the CLI/TUI, backend, and Web client, collect the TUI native libraries, workers, and runtime dependencies, then assemble the distribution. Running the distribution still requires Node.js; use the version specified in `mise.toml`.

Before packaging, set the download base URL with `ZCODE_DIST_BASE_URL` in `.env`, `.env.local`, or the process environment, or pass it through `--base-url`. The URL below is a placeholder; replace it with your hosting URL when publishing:

```bash
pnpm build:zcode --base-url https://downloads.example.com/zcode/

# When ZCODE_DIST_BASE_URL is already configured
pnpm build:zcode

# Repackage existing Agent, backend, and Web build outputs
pnpm build:zcode --skip-build

# Show options for the version, output directory, and more
pnpm build:zcode --help
```

The version defaults to the root `package.json` version. Output is written to `dist/zcode/`:

- `releases/<version>/zcode-<version>.tar.gz`: runtime package.
- `releases/<version>/sha256.txt`: checksum file.
- `latest.json` and `install.sh`: version index and installer.

Upload the entire directory to the configured download base URL. The installer downloads the runtime package from that URL, installs it to `~/.zcode/runtime` by default, and creates the `zcode` command in `~/.local/bin`. Override these directories with `ZCODE_DIST_HOME` and `ZCODE_DIST_BIN_DIR`, respectively.

Existing Lite users should switch to the new build command, environment variables, and installer. Installation does not remove old Lite directories or migrate/delete session data.

To test a packaged build locally, extract and run it directly without uploading or installing it:

```bash
zcode_version=$(node -p "require('./dist/zcode/latest.json').version")
mkdir -p dist/zcode/debug
tar -xzf "dist/zcode/releases/$zcode_version/zcode-$zcode_version.tar.gz" \
  -C dist/zcode/debug
# Start the TUI by default
node dist/zcode/debug/zcode/bin/zcode.mjs

# Start Web mode
node dist/zcode/debug/zcode/bin/zcode.mjs --web \
  --workspace "$PWD" --port 3030 --no-open
```

Open `http://127.0.0.1:3030` to validate the complete flow, with one backend serving the Web pages and running the Agent. The port must be available; if `pnpm dev:web` is already running, choose another `--port`.

## Repository Structure

| Directory                                            | Responsibility                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `packages/desktop`                                   | Electron Main, Host, Renderer, and desktop packaging                                    |
| `packages/web`                                       | Web client                                                                              |
| `packages/server`                                    | HTTP / WebSocket services and remote connections                                        |
| `packages/zcode-server-cli`                          | Standalone server startup and process management                                        |
| `packages/ui`                                        | Shared React components, hooks, and Zustand state                                       |
| `packages/services`                                  | Business services and persistence                                                       |
| `packages/shared`, `packages/rpc`, `packages/client` | Shared protocols and types, RPC framework, and Agent client SDK                         |
| `packages/provider`, `packages/provider-node`        | Common provider capabilities and Node implementations                                   |
| `apps/zcode-cli`                                     | Agent CLI, TUI, runtime, and tools                                                      |
| `scripts`, `config`, `third-party`                   | Build and maintenance scripts, built-in configuration, and third-party notice materials |

## Project Notice

See [NOTICE.md](NOTICE.md) for feature and promotion scope, maintenance policy, execution and data risks, licensing, and third-party copyright information.
