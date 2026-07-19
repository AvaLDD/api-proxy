Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname.startsWith("/v1/")) {
    url.pathname = "/api" + url.pathname;
  }
  url.hostname = "openrouter.ai";

  const headers = new Headers(req.headers);
  const apiKey = headers.get("x-api-key");
  if (apiKey) {
    headers.delete("x-api-key");
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  headers.delete("anthropic-version");

  const resp = await fetch(url.toString(), {
    method: req.method,
    headers,
    body: req.body,
  });

  const contentType = resp.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream")) {
    const body = await resp.text();
    // 替换所有 SSE 事件中的 provider 前缀 model 名
    const fixed = body.replace(
      /"model":"[^/]+\/(claude-[^"]+)"/g,
      '"model":"$1"'
    );
    return new Response(fixed, {
      status: resp.status,
      headers: resp.headers,
    });
  } else {
    const body = await resp.text();
    try {
      const data = JSON.parse(body);
      if (data.model && data.model.includes("/")) {
        data.model = data.model.replace(/^[^/]+\//, "");
      }
      return new Response(JSON.stringify(data), {
        status: resp.status,
        headers: resp.headers,
      });
    } catch {
      return new Response(body, {
        status: resp.status,
        headers: resp.headers,
      });
    }
  }
});
