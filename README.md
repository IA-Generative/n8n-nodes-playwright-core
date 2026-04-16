# @ia-generative/n8n-nodes-playwright-core

This is an n8n community node. It lets you automate browser actions in your n8n workflows using Playwright Core over a remote WebSocket endpoint.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Operations](#operations)
[Sessions](#sessions)
[File Downloads](#file-downloads)
[Custom Scripts](#custom-scripts)
[Remote browser server](#remote-browser-server)
[Installation](#installation)
[Compatibility](#compatibility)
[Resources](#resources)
[Version history](#version-history)
[Acknowledgements](#acknowledgements)

## Operations

This node supports the following operations:

* **Navigate**: Navigate to a URL and return the current page content
* **Get Text**: Extract text from an element using CSS selector or XPath
* **Click Element**: Click an element using CSS selector or XPath
* **Fill Form**: Fill one or more form fields using CSS selectors or XPath
* **Take Screenshot**: Capture the current page as binary data
* **Download File**: Download a file either from a clicked element or a direct URL
* **Run Custom Script**: Execute custom JavaScript code with access to Playwright and n8n helpers
* **Close Session**: Explicitly close a previously opened browser session

### Selectors and form filling

For **Get Text**, **Click Element**, and element-based **Download File**, you can choose between:

* **CSS Selector**
* **XPath**

For **Fill Form**, each field accepts either a CSS selector or an XPath expression. XPath is detected automatically when the selector starts with `/` or `(`.

This allows a single form operation to fill multiple fields in sequence.

### Screenshots

The **Take Screenshot** operation stores the screenshot as binary data and supports:

* Full-page screenshots
* Optional output path
* Custom binary property name

## Sessions

This fork adds reusable browser session support so multiple Playwright nodes can work on the same remote browser session within a single workflow execution.

### Session key resolution

Each operation resolves its session key in the following order of priority:

1. **Explicit Session ID** — if provided in the node parameters, it is used as-is
2. **Propagated session key** — if a previous Playwright node in the same execution passed a session key downstream, it is reused automatically
3. **Random UUID** — if neither of the above is set, a new unique session key is generated for this execution

### Session lifecycle

* If **Leave Session Open** is enabled, the session stays alive after the operation and is available for subsequent Playwright nodes
* If **Leave Session Open** is disabled, the session is closed immediately after the operation
* The **Close Session** operation terminates a session explicitly at any point in the workflow
* Sessions are automatically removed from memory when the remote browser disconnects

### Remote browser connection

New sessions connect to the remote browser using a **Playwright WebSocket** endpoint.

> ⚠️ Only **Chromium** and **Firefox** are currently supported. WebKit is not supported.

### Typical session workflow

1. Navigate to a login page
2. Fill and submit the login form
3. Extract data from the authenticated session
4. Download a file
5. Close the session explicitly

## File Downloads

The **Download File** operation supports two download modes.

### Download from element

The node can click a page element and try several strategies to capture the downloaded file, including:

* Playwright download events
* Direct response capture
* Popup response capture
* Fetching the resolved target URL when available

This is useful for flows where clicking a link or button triggers a document download or opens a PDF in a new page.

### Download from URL

The node can also fetch a file directly from a provided URL.

When needed, it can resolve relative URLs against the current page and try both:

* In-page browser fetch with credentials
* Direct request through the Playwright request context

Downloaded files are returned as n8n binary data under the configured binary property name.

## Custom Scripts

The **Run Custom Script** operation gives you direct access to the current Playwright session and useful n8n helpers inside a sandboxed JavaScript environment.

### Available variables

Your script can access:

* `$page` - current Playwright page
* `$browser` - current Playwright browser
* `$playwright` - Playwright Core module
* `$helpers` - n8n helper methods
* `$json` - current input item JSON
* `$input` - access to input data
* `$getNodeParameter()` - access node parameters
* other standard n8n Code node variables available through the workflow data proxy

### Notes

* Your script must return an array of items
* Binary data can be created with `$helpers.prepareBinaryData()`
* `console.log()` output is available in manual executions
* The script runs in a sandboxed VM environment

### Example

```javascript
const title = await $page.title();

return [
	{
		json: {
			title,
			url: $page.url(),
		},
	},
];
```

## Remote browser server

This node does **not** launch browsers locally. It connects to a remote Playwright server that exposes a WebSocket endpoint. You need to run such a server separately.

### Why a separate server?

Running browsers inside an n8n container introduces significant complexity: heavy system dependencies, large image sizes, sandboxing constraints, and security concerns. Offloading the browser to a dedicated container keeps the n8n image lean and lets you scale or replace the browser service independently.

### Using the provided `Dockerfile-playwright`

This repository includes a `Dockerfile-playwright` that builds a ready-to-use Playwright server image:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.58.2-jammy
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV XDG_RUNTIME_DIR=/tmp/.chromium
ENV XDG_CACHE_HOME=/tmp/.chromium
ENV NPM_CONFIG_CACHE=/tmp/.npm
RUN npx --yes playwright@1.58.2 install firefox
RUN npx --yes playwright@1.58.2 install chromium
CMD ["npx", "playwright@1.58.2", "run-server", "--port", "3000"]
```

**What it does:**

* Starts from the official Microsoft Playwright base image pinned to **v1.58.2** — the same version used by this node
* Installs Chromium and Firefox browser binaries
* Runs `playwright run-server` on port **3000**, which exposes a WebSocket endpoint compatible with `playwright.connect()`

> The Playwright version in this image **must match** the `playwright-core` version used by the node (currently `1.58.2`). See the [Compatibility](#compatibility) section for details.

### Using with Docker Compose

The repository also includes a `docker-compose.yml` that wires the n8n node and the Playwright server together:

```yaml
services:
  n8n:
    build: .
    image: n8n-playwright-core
    ports:
      - '5678:5678'
    environment:
      - N8N_COMMUNITY_PACKAGES_ENABLED=true
      - N8N_CUSTOM_EXTENSIONS=/opt/custom-nodes
      # ...

  playwright:
    image: ghcr.io/ia-generative/playwright:v1.58.2-jammy-browsers
    build:
      dockerfile: Dockerfile-playwright
    ports:
      - '3000:3000'
```

Start the full stack with:

```bash
docker compose up
```

In your n8n Playwright node credentials, set the browser endpoint to:

```text
ws://playwright:3000
```

The `playwright` hostname resolves automatically via Docker Compose's internal network.

### Using a pre-built image

A pre-built image is published at:

```text
ghcr.io/ia-generative/playwright:v1.58.2-jammy-browsers
```

You can use it directly without building locally:

```yaml
playwright:
  image: ghcr.io/ia-generative/playwright:v1.58.2-jammy-browsers
  ports:
    - '3000:3000'
```

### Relation to IA-Generative/n8n-image

The companion repository [IA-Generative/n8n-image](https://github.com/IA-Generative/n8n-image) provides production-ready Docker images for the full stack:

* `n8n-image/playwright/` — the Dockerfile for the remote Playwright browser server (mirrors `Dockerfile-playwright` in this repo)
* `n8n-image/nodes/` — the package manifest that pins this node (`n8n-nodes-playwright-core`) as a dependency of the n8n image

> ⚠️ **Version parity is required.** The version of `playwright-core` declared in this package **must match** the Playwright version used in `n8n-image/playwright/Dockerfile`. Any mismatch between the two repositories will cause connection or protocol errors at runtime.

When upgrading `playwright-core` in this package, the corresponding Playwright version in `n8n-image` must be updated at the same time. Both repositories are currently developed in sync on their respective dev branches.

## Installation

### 1. Install the package

```bash
npm install n8n-nodes-playwright-core
# or
pnpm install n8n-nodes-playwright-core
```

### 2. Using in a custom n8n Docker image

To integrate this node into a custom n8n image:

```dockerfile
FROM n8nio/n8n:latest

USER root

RUN npm install n8n-nodes-playwright-core

USER node
```

Then build the image:

```bash
docker build -t my-n8n .
```

## Compatibility

This node requires:

* n8n 1.0.0 or later
* Node.js 22.22.1 or later
* A Playwright-compatible remote browser endpoint reachable over WebSocket
  (e.g. a self-hosted Playwright server or any equivalent service, including [Browserless](https://docs.browserless.io/))

This fork does not install browser binaries automatically. Browser execution is expected to be handled by a remote Playwright-compatible service.

### Playwright version compatibility

This node uses `playwright-core` **1.58.2**.

> ⚠️ **The version of `playwright-core` used by this node must match the version of Playwright installed on your remote browser server.**
>
> A version mismatch between the client (this node) and the server (your browser endpoint) can cause connection failures, protocol errors, or unpredictable behavior. Always ensure both sides run the same Playwright version.

If you are building your own remote browser Docker image, pin the Playwright version explicitly:

```dockerfile
RUN npx --yes playwright@1.58.2 install --with-deps firefox chromium
```

Or with npm:

```bash
npm install playwright@1.58.2
```

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
* [Playwright documentation](https://playwright.dev/docs/intro)
* [Playwright API reference](https://playwright.dev/docs/api/class-playwright)
* [IA-Generative/n8n-image](https://github.com/IA-Generative/n8n-image) — companion repository with production Docker images for the full n8n + Playwright stack

## Version history

### 0.1.0

Initial public version of this fork.

Main changes compared with the original upstream project:

* Migrated to `playwright-core` (no local browser binaries)
* Switched to a remote WebSocket-based browser connection model
* Added reusable session support with automatic key propagation across nodes
* Sessions are stored in memory and cleaned up automatically on browser disconnect
* Added explicit session closing with the **Close Session** operation
* Added **Download File** operation with multiple download strategies
* Improved form filling with support for multiple fields and XPath selectors
* Kept custom script execution with sandboxed access to Playwright and n8n helpers
* Pinned `playwright-core` to **1.58.2** for predictable server compatibility

## Acknowledgements

This project started as a fork of [toema/n8n-playwright](https://github.com/toema/n8n-playwright) and was adapted in March 2026 to support a Playwright Core remote workflow with reusable sessions and extended download handling.

It is based on the original work by [Mohamed Toema](https://github.com/toema). Many thanks to him for the initial implementation and for making the original project available as open source.