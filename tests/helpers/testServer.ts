import http from 'node:http';

type TestServer = {
    port: number;
    baseUrl: string;
    close: () => Promise<void>;
};

export async function createTestServer(): Promise<TestServer> {
    const server = http.createServer((req, res) => {
        const url = req.url || '/';

        if (url === '/') {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(`
				<!doctype html>
				<html>
					<head>
						<meta charset="utf-8" />
						<title>Playwright Test Page</title>
					</head>
					<body>
						<h1 id="title">Integration Test Page</h1>

						<button id="action-button" onclick="document.body.setAttribute('data-clicked', 'yes')">
							Click me
						</button>

						<form id="login-form">
							<input id="username" name="username" type="text" />
							<input id="password" name="password" type="password" />
							<button id="submit" type="button" onclick="globalThis.__submitted = true">Submit</button>
						</form>

						<a id="download-link" href="/download/test.txt">Download file</a>
					</body>
				</html>
			`);
            return;
        }

        if (url === '/download/test.txt') {
            const body = Buffer.from('hello from test file', 'utf8');

            res.writeHead(200, {
                'content-type': 'text/plain; charset=utf-8',
                'content-disposition': 'attachment; filename="test.txt"',
                'content-length': String(body.length),
            });
            res.end(body);
            return;
        }

        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
    });

    await new Promise<void>((resolve, reject) => {
        server.listen(0, '0.0.0.0', () => resolve());
        server.once('error', reject);
    });

    const address = server.address();

    if (!address || typeof address === 'string') {
        throw new Error('Failed to start test server');
    }

    return {
        port: address.port,
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: async () => {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => {
                    if (error) reject(error);
                    else resolve();
                });
            });
        },
    };
}
