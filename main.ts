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
  } else {
    headers.set("Authorization", `Bearer ${Deno.env.get("OPENROUTER_API_KEY")}`);
  }
  headers.delete("anthropic-version");

  const resp = await fetch(url.toString(), {
    method: req.method,
    headers,
    body: req.body,
  });

  // 空 body 直接返回
  if (resp.status === 204 || resp.status === 304 || !resp.body) {
    return new Response(null, {
      status: resp.status,
      headers: resp.headers,
    });
  }

  const contentType = resp.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream")) {
    const body = await resp.text();
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
