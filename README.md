# @ia-generative/n8n-nodes-playwright-core

This is an n8n community node. It lets you automate browser actions in your n8n workflows using Playwright Core over a Browserless-compatible CDP endpoint.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)
[Requirements](#requirements)
[Operations](#operations)
[Sessions](#sessions)
[File Downloads](#file-downloads)
[Custom Scripts](#custom-scripts)
[Compatibility](#compatibility)
[Resources](#resources)
[Version history](#version-history)
[Acknowledgements](#acknowledgements)

## Installation

Ce package est publié sur le **GitHub Package Registry**. Une authentification GitHub est requise même pour les packages publics.

### 1. Configurer l'authentification GitHub Package Registry

Créez un [Personal Access Token (PAT)](https://github.com/settings/tokens) avec le scope `read:packages`, puis configurez npm :

```bash
npm config set @ia-generative:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken YOUR_GITHUB_TOKEN
```

Ou via un fichier `.npmrc` à la racine du projet :

```
@ia-generative:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

### 2. Installer le package

```bash
npm install @ia-generative/n8n-nodes-playwright-core
# ou
pnpm install @ia-generative/n8n-nodes-playwright-core
```

### 3. Utilisation dans une image Docker n8n

Pour intégrer ce node dans une image n8n personnalisée :

```dockerfile
FROM n8nio/n8n:latest

USER root

ARG GITHUB_TOKEN

RUN npm config set @ia-generative:registry https://npm.pkg.github.com \
    && npm config set //npm.pkg.github.com/:_authToken ${GITHUB_TOKEN} \
    && cd /usr/local/lib \
    && npm install @ia-generative/n8n-nodes-playwright-core \
    && npm config delete //npm.pkg.github.com/:_authToken

USER node
```

Puis construire l'image en passant le token :

```bash
docker build --build-arg GITHUB_TOKEN=YOUR_GITHUB_TOKEN -t my-n8n .
```

> ⚠️ Le token est supprimé de la configuration npm après l'installation pour ne pas le laisser dans l'image finale.

## Requirements

This node is designed to work with:

* n8n
* Node.js 18.10 or later
* a Browserless-compatible endpoint reachable over CDP
* `playwright-core` as the browser automation library

Unlike the original upstream package, this fork does not install browser binaries automatically. Browser execution is expected to be handled by your Browserless service or equivalent remote browser environment.

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

## Sessions

This fork adds reusable browser session support so multiple Playwright nodes can work on the same remote browser session.

### Session behavior

* If **Session ID** is left empty, the node automatically creates and reuses one session per workflow execution and item index
* If **Session ID** is provided, that session key is reused explicitly across nodes
* If **Leave Session Open** is enabled, the browser session stays available for the next Playwright node
* If **Leave Session Open** is disabled, the session is closed after the current operation
* The **Close Session** operation can be used to terminate a session manually

This makes it possible to split a browser flow across multiple nodes. A typical workflow can look like this:

1. Navigate to a login page
2. Fill and submit the form
3. Extract data from the authenticated session
4. Download a file
5. Close the session explicitly

### Browser connection

New sessions are created through a Browserless-compatible CDP endpoint using Chromium over CDP.

## File Downloads

The **Download File** operation supports two download modes.

### Download from element

The node can click a page element and try several strategies to capture the downloaded file, including:

* Playwright download events
* direct response capture
* popup response capture
* fetching the resolved target URL when available

This is useful for flows where clicking a link or button triggers a document download or opens a PDF in a new page.

### Download from URL

The node can also fetch a file directly from a provided URL.

When needed, it can resolve relative URLs against the current page and try both:

* in-page browser fetch with credentials
* direct request through the Playwright request context

Downloaded files are returned as n8n binary data under the configured binary property name.

## Selectors and form filling

For **Get Text**, **Click Element**, and element-based **Download File**, you can choose between:

* **CSS Selector**
* **XPath**

For **Fill Form**, each field accepts either a CSS selector or an XPath expression. XPath is detected automatically when the selector starts with `/` or `(`.

This allows a single form operation to fill multiple fields in sequence.

## Screenshots

The **Take Screenshot** operation stores the screenshot as binary data and supports:

* full-page screenshots
* optional output path
* custom binary property name

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

return [{
    json: {
        title,
        url: $page.url()
    }
}];
```

## Compatibility

* Requires n8n 1.0.0 or later
* Requires Node.js 18.10 or later
* Designed for Playwright Core with a Browserless-compatible CDP endpoint
* Tested in a remote-browser workflow using Chromium over CDP

This fork is not documented as a local multi-browser package with automatic browser installation. Its intended use is a remote browser setup centered on Playwright Core and Browserless-style infrastructure.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
* [Playwright documentation](https://playwright.dev/docs/intro)
* [Playwright API reference](https://playwright.dev/docs/api/class-playwright)
* [Browserless documentation](https://docs.browserless.io/)

## Version history

### 0.1.0

Initial public version of this fork.

Main changes compared with the original upstream project:

* migrated to `playwright-core`
* switched to a Browserless/CDP-based browser connection model
* added reusable session support across nodes
* added explicit session closing with **Close Session**
* added **Download File** operation
* improved form filling with support for multiple fields
* kept custom script execution with sandboxed access to Playwright and n8n helpers

## Acknowledgements

This project started as a fork of [toema/n8n-playwright](https://github.com/toema/n8n-playwright) and was adapted in March 2026 to support a Playwright Core + Browserless workflow with reusable sessions and extended download handling.

It is based on the original work by [Mohamed Toema](https://github.com/toema). Many thanks to him for the initial implementation and for making the original project available as open source.