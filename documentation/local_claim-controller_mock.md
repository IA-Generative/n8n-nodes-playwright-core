This mock can be used to test the `Claim: Create Instance` operation in the Playwright node without running a real `claim-controller` connected to Kubernetes.

It exposes an endpoint compatible with the expected contract:

`POST /claim`

Expected request body:

```json
{
  "TTL": "3m"
}
```

Mock response:

```json
{
  "data": {
    "fqdn": "playwright:3000"
  }
}
```

The Playwright node then converts this response into:

```json
{
  "browserEndpoint": "ws://playwright:3000"
}
```

## Start the mock

From the `n8n-nodes-playwright-core` repository, with the local Docker environment already running:

```bash
docker run --rm -d \
  --name claim-controller-mock \
  --network n8n-nodes-playwright-core_default \
  --network-alias claim-controller-mock \
  node:22-alpine \
  node -e "const http=require('http'); http.createServer((req,res)=>{let body=''; req.on('data',c=>body+=c); req.on('end',()=>{console.log(req.method,req.url,body); if(req.method!=='POST'||req.url!=='/claim'){res.writeHead(404,{'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'not found'}));} res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({data:{fqdn:'playwright:3000'}}));});}).listen(8080,'0.0.0.0',()=>console.log('mock claim-controller listening on 8080'))"
```

The mock is reachable from the n8n container at:

```txt
http://claim-controller-mock:8080
```

## Test the mock from the n8n container

```bash
docker compose exec -T n8n node - <<'NODE'
const response = await fetch('http://claim-controller-mock:8080/claim', {
	method: 'POST',
	headers: {
		'Content-Type': 'application/json',
	},
	body: JSON.stringify({
		TTL: '3m',
	}),
});

console.log('status:', response.status);
console.log('body:', await response.text());
NODE
```

Expected output:

```txt
status: 200
body: {"data":{"fqdn":"playwright:3000"}}
```

## Use it in n8n

In the Playwright node:

```txt
Operation = Claim: Create Instance
Claim Controller URL = http://claim-controller-mock:8080
TTL = 3m
Claim Timeout = 120000
```

Expected output:

```json
{
  "browserEndpoint": "ws://playwright:3000"
}
```

In the next Playwright node, use this value in the `Browser Endpoint` field:

```js
{{ $('Name of the claim node').first().json.browserEndpoint }}
```

For example, use a `Navigate` operation with:

```txt
https://example.com
```

If the navigation works, the full chain is validated:

```txt
mock claim-controller -> browserEndpoint -> Playwright server -> browser navigation
```

## Inspect received requests

```bash
docker logs claim-controller-mock
```

## Stop the mock

```bash
docker rm -f claim-controller-mock
```

## Notes

The mock must run on the same Docker network as n8n.

In this project, the network is usually:

```txt
n8n-nodes-playwright-core_default
```

The returned `fqdn` is intentionally set to `playwright:3000`, because `playwright` is the Playwright service name in the local Docker Compose setup.

Do not include `/claim` in the `Claim Controller URL` field. The Playwright operation appends `/claim` automatically.