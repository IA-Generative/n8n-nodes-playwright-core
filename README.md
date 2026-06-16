# @ia-generative/n8n-nodes-playwright-core

This is an n8n community node. It lets you automate browser actions in your n8n workflows using Playwright Core over a remote WebSocket endpoint.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Operations](#operations)
[Sessions](#sessions)
[Browser connection options](#browser-connection-options)
[File Downloads](#file-downloads)
[Protocol restrictions](#protocol-restrictions)
[Custom Scripts](#custom-scripts)
[Remote browser server](#remote-browser-server)
[Installation](#installation)
[Development and tests](#development-and-tests)
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
* **Run Custom Script**: Execute custom JavaScript with access to Playwright and n8n helpers. This operation is disabled by default
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

## Browser connection options

### Connection timeout

The connection timeout controls how long the node waits when connecting to the remote Playwright server.

The default value is `30000` milliseconds.

### Session ID

A custom session ID can be used to reuse a specific browser session across multiple Playwright nodes.

When no explicit session ID is provided, the node first tries to reuse the session propagated by the previous Playwright node. If none is available, it generates a random UUID.

### Ignore SSL Issues (Insecure)

The **Ignore SSL Issues (Insecure)** option allows the browser context to ignore TLS certificate errors such as:

* Self-signed certificates
* Certificates issued by an unknown authority
* Invalid or incomplete certificate chains
* Expired certificates

The option is disabled by default.

Enable it only when accessing trusted environments whose certificates cannot be recognized by the Playwright browser infrastructure.

The option is applied when the browser context is created. It cannot be changed on an existing session. To use a different value, close the current session or use a different session ID.

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

When needed, it can resolve relative URLs against the current page and try:

* In-page browser fetch with credentials
* Direct request through the Playwright request context
* Node.js fetch as a fallback

Downloaded files are returned as n8n binary data under the configured binary property name.

## Protocol restrictions

For security reasons, the node only allows the following protocols by default:

* `http`
* `https`

This restriction prevents workflows from using protocols such as `file://` to access files stored on the remote Playwright server or its container.

The restriction applies to:

* URLs provided to the **Navigate** operation
* Direct URLs provided to the **Download File** operation
* URLs resolved from element links
* Redirects and browser navigations
* Form submissions
* Popups opened inside the managed browser context

### Allowing additional protocols

Administrators can explicitly allow additional protocols with the following n8n environment variable:

```yaml
- N8N_PLAYWRIGHT_NODE_PROTOCOLS=[]
```

The value must be a valid JSON array.

An empty array keeps the secure default and does not add any protocol:

```yaml
- N8N_PLAYWRIGHT_NODE_PROTOCOLS=[]
```

To allow `file://` explicitly:

```yaml
- N8N_PLAYWRIGHT_NODE_PROTOCOLS=["file"]
```

Multiple additional protocols can be configured:

```yaml
- N8N_PLAYWRIGHT_NODE_PROTOCOLS=["file","ftp"]
```

`http` and `https` are always allowed and do not need to be included in the variable.

Protocol names are case-insensitive and may optionally contain a trailing colon.

> ⚠️ Allowing `file` gives workflows access to files visible from the remote Playwright browser environment. Enable it only when this behavior is explicitly required and the workflow authors are trusted.

Browser-internal protocols such as `about:`, `blob:`, `data:`, and `chrome-extension:` may be allowed internally when required for normal browser behavior. They are not accepted as user-provided operation URLs unless explicitly configured.

## Custom Scripts

The **Run Custom Script** operation is disabled by default for security reasons.

Custom scripts receive direct access to powerful Playwright objects such as `$page`, `$browser`, and `$playwright`. This access can bypass restrictions enforced by the standard node operations and must only be enabled for trusted workflow authors.

### Enabling custom scripts

Administrators can enable the operation with the following n8n environment variable:

```yaml
- N8N_PLAYWRIGHT_NODE_CUSTOM_SCRIPT_ENABLED=true
```

The value is case-insensitive. Values such as `true`, `TRUE`, and `True` are accepted.

When the variable is absent, empty, or set to any value other than `true`:

* The **Run Custom Script** operation is hidden from the node interface
* The script editor and related fields are removed from the interface
* Existing workflows using `runCustomScript` fail with an explicit error during execution

To keep custom scripts explicitly disabled:

```yaml
- N8N_PLAYWRIGHT_NODE_CUSTOM_SCRIPT_ENABLED=false
```

> ⚠️ Enabling custom scripts grants workflow authors direct access to Playwright APIs and should only be done in trusted environments.

### Available variables

When the feature is enabled, scripts can access:

* `$page` - current Playwright page
* `$browser` - current Playwright browser
* `$playwright` - Playwright Core module
* `$helpers` - n8n helper methods
* `$json` - current input item JSON
* `$input` - access to input data
* `$getNodeParameter()` - access node parameters
* Other standard n8n Code node variables available through the workflow data proxy

### Notes

* The script must return an array of items
* Binary data can be created with `$helpers.prepareBinaryData()`
* `console.log()` output is available in manual executions
* The script runs in a sandboxed VM environment
* The feature flag controls availability but does not restrict the Playwright APIs exposed when custom scripts are enabled
* Protocol restrictions applied by the standard node operations must not be treated as a complete sandbox boundary for arbitrary custom Playwright code

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
RUN npx --yes playwright@1.58.2 install firefox \
		&& npx --yes playwright@1.58.2 install chromium
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
      - N8N_PLAYWRIGHT_NODE_PROTOCOLS=[]
      - N8N_PLAYWRIGHT_NODE_CUSTOM_SCRIPT_ENABLED=false

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

In your n8n Playwright node, set the browser endpoint to:

```text
ws://playwright:3000
```

The `playwright` hostname resolves automatically through Docker Compose's internal network.

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

* `n8n-image/playwright/` — the Dockerfile for the remote Playwright browser server, mirroring `Dockerfile-playwright` in this repository
* `n8n-image/nodes/` — the package manifest that pins this node (`n8n-nodes-playwright-core`) as a dependency of the n8n image

> ⚠️ **Version parity is required.** The version of `playwright-core` declared in this package **must match** the Playwright version used in `n8n-image/playwright/Dockerfile`. Any mismatch between the two repositories will cause connection or protocol errors at runtime.

When upgrading `playwright-core` in this package, the corresponding Playwright version in `n8n-image` must be updated at the same time. Both repositories are currently developed in sync on their respective dev branches.

## Installation

### 1. Install the package

```bash
npm install n8n-nodes-playwright-core
```

Or:

```bash
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

## Development and tests

Install dependencies and build the project:

```bash
pnpm install
pnpm run build
```

Run linting:

```bash
pnpm run lint
```

Run unit tests:

```bash
pnpm test
```

### Integration tests

The integration tests require the Docker Compose stack, including the remote Playwright server, to be running:

```bash
docker compose up --build
```

The tests start an HTTP server on the host machine. The remote Playwright container must reach that server through the current Docker network gateway.

Run the integration tests with the gateway detected dynamically:

```bash
PLAYWRIGHT_TEST_HOST="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}' "$(docker compose ps -q playwright)")" pnpm run test:integration
```

Using the dynamic gateway avoids relying on a Docker network address that may change after recreating the stack.

Run all unit and integration tests in environments where the required services are available:

```bash
pnpm run test:ci
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
> A version mismatch between the client and the server can cause connection failures, protocol errors, or unpredictable behavior. Always ensure both sides run the same Playwright version.

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

### 2.0.0

* Disabled **Run Custom Script** by default for security reasons
* Added `N8N_PLAYWRIGHT_NODE_CUSTOM_SCRIPT_ENABLED` to explicitly enable custom scripts
* Removed the Custom Script operation and related fields from the node interface when the feature is disabled
* Added a server-side execution guard for existing workflows containing `runCustomScript`
* Added unit tests covering the feature flag and conditional node interface
* Documented the security implications of enabling direct Playwright script access

> ⚠️ **Breaking change:** Existing workflows using **Run Custom Script** require `N8N_PLAYWRIGHT_NODE_CUSTOM_SCRIPT_ENABLED=true` after upgrading.

### 1.2.0

* Added an **Ignore SSL Issues (Insecure)** browser connection option for trusted environments using unrecognized TLS certificates
* Restricted user-provided URLs to `http` and `https` by default
* Added `N8N_PLAYWRIGHT_NODE_PROTOCOLS` to explicitly allow additional protocols
* Added protocol validation for navigation, downloads, element links, redirects, form submissions, and popups
* Added unit and integration tests for protocol restrictions

### 1.0.0

Changes since `0.1.0`:

* Removed the CDP connection mode and kept a single remote Playwright WebSocket connection model
* Added support for basic and generic auth credentials in **Fill Form**
* Added optional submit action support in **Fill Form**
* Restricted the credential field to **Fill Form** only
* Improved the **Fill Form** UI
* Added a notice explaining how to reuse the same session when the previous node is not a Playwright node

### 0.1.0

Initial public version of this fork.

Main changes compared with the original upstream project:

* Migrated to `playwright-core` with no local browser binaries
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
