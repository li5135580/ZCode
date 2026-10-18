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
- **Smart Fallback**: Execute in order, automatically switch to the next fallback after 5 failures
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

### 3. Multi-Spot Annotations

- **Extends the original button**: Select part of an assistant reply and click "Add to chat";
  the menu expands a note field. "Skip and add" is the original one-click behavior without a note
- **Per-quote notes**: Write what should change at that spot
- **Annotate several spots**: Mark multiple deviations in one turn, then send them together as
  a single message
- **Edit before sending**: Each note can be edited or removed in the composer's quote list

### 4. GitHub Actions Auto Sync & Release

- **Auto Sync Upstream**: Check upstream for new commits hourly and merge them automatically
  (custom commits are preserved by git)
- **Auto Build & Release**: Automatically build packages (Windows, macOS, Linux) and publish on push
- **Conflict Notification**: Automatically create an Issue when merge conflicts occur

### 5. Custom Update Source & Manual Check

- **Update Source Switch**: Client update detection source points at this repository's GitHub Releases
- **Manual Check**: Available from the app menu, tray, and Help menu — including the Preview build
- **Environment Variable Override**: Support custom update source via `ZCODE_UPDATE_FEED_URL`

---

## 📦 Installation

### Option 1: Download the installer (Recommended)

**For users who want to try the enhanced features without building from source**

Download the package for your platform from this repository's
[Releases](https://github.com/li5135580/ZCode/releases/latest):

| Platform | Artifact | Notes |
| --- | --- | --- |
| Windows x64 | `ZCode.Preview-<version>-win-x64.exe` | NSIS installer |
| macOS arm64 | `ZCode.Preview-<version>-mac-arm64.dmg` | Apple Silicon; unsigned, requires manual Gatekeeper approval |
| Linux x64 | `ZCode.Preview-<version>-linux-x64.AppImage` | Portable; `chmod +x` then run. Also the auto-update artifact format |
| Linux x64 | `ZCode.Preview-<version>-linux-x64.deb` | Debian/Ubuntu first install; auto-update still uses the AppImage |

The installer is **built from this fork's source by CI** (not a patch applied on top of the
official package), so the enhanced features are already included:

- Subagent model chains
- Automatic model fetching
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
  installer version is injected at build time (`<upstream patch+1>-fork.N`), so it is strictly
  increasing in semver terms and installed clients receive updates normally.
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

---

## Original Description

ZCode is an AI coding workspace with desktop, browser, and terminal interfaces. This repository contains the clients, backend services, shared UI, and Agent CLI and runtime source code.

## Updates

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
