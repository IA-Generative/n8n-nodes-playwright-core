## Using the local mitmproxy setup

This setup is used to verify that Playwright browser traffic goes through the configured proxy, and that `NO_PROXY` bypass rules work as expected.

## Start the local stack

Start the local Docker environment as usual:

```bash
docker compose up -d --build
```

The mitmproxy web interface is available at:

```txt
http://localhost:8081
```

Use it to inspect requests going through the proxy.

## Verify that n8n sees the proxy environment variables

```bash
docker compose exec -T n8n env | grep -i proxy
```

The output should include values such as:

```txt
HTTP_PROXY=http://proxy:8080
HTTPS_PROXY=http://proxy:8080
ALL_PROXY=http://proxy:8080
NO_PROXY=localhost,127.0.0.1,n8n,playwright,claim-controller,claim-controller-mock
```

## Verify mitmproxy directly

Run a request through the proxy:

```bash
docker run --rm \
  --network n8n-nodes-playwright-core_default \
  curlimages/curl:latest \
  -x http://proxy:8080 \
  -i http://example.com
```

Expected response:

```txt
X-Mocked-By: mitmproxy
X-Proxied: true
MOCKED RESPONSE via PROXY
```

If this works, the proxy service and mock response script are working correctly.

## Test Playwright navigation through the proxy

In n8n, run a Playwright node with:

```txt
Operation = Navigate
URL = http://example.com
Browser Endpoint = ws://playwright:3000
```

Expected output should contain:

```txt
MOCKED RESPONSE via PROXY
```

You should also see the request in the mitmproxy web interface.

This confirms that Playwright browser navigation is using the proxy.

## Test NO_PROXY bypass

Temporarily add `example.com` to both `NO_PROXY` and `no_proxy` in the `n8n` service environment.

Then restart:

```bash
docker compose up -d --build
```

Run the same Playwright `Navigate` test again:

```txt
URL = http://example.com
```

Expected output should now contain the real Example Domain page:

```txt
Example Domain
```

It should no longer return the mocked mitmproxy response.

This confirms that `NO_PROXY` bypass is respected.

## Cleanup

When the test is done, remove `example.com` from `NO_PROXY` / `no_proxy` if it was only added for the bypass test.

Then restart the stack:

```bash
docker compose up -d --build
```
