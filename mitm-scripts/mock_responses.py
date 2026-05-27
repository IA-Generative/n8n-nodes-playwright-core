from mitmproxy import http

def request(flow: http.HTTPFlow) -> None:
    print(f"[PROXY] Request intercepted: {flow.request.method} {flow.request.url}")

def response(flow: http.HTTPFlow) -> None:
    flow.response = http.Response.make(
        200,
        b"""
        <html>
          <body>
            <h1>MOCKED RESPONSE via PROXY</h1>
            <p>This response comes from the mitmproxy test proxy.</p>
          </body>
        </html>
        """,
        {
            "Content-Type": "text/html",
            "X-Mocked-By": "mitmproxy",
            "X-Proxied": "true",
        },
    )

    print(f"[PROXY] Mocked response for: {flow.request.url}")