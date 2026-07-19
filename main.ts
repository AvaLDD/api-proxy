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

  // —— 关键改动:处理请求体,剥掉历史里的思考块 ——
  let outBody: BodyInit | null = req.body;
  if (req.method === "POST") {
    try {
      const reqData = await req.json();
      if (Array.isArray(reqData.messages)) {
        for (const msg of reqData.messages) {
          if (Array.isArray(msg.content)) {
            msg.content = msg.content.filter(
              (b: any) => b?.type !== "thinking" && b?.type !== "redacted_thinking"
            );
          }
        }
      }
      outBody = JSON.stringify(reqData);
      headers.delete("content-length"); // body 长度变了,让 fetch 重算
    } catch {
      outBody = req.body; // 解析失败就原样转发
    }
  }

  const resp = await fetch(url.toString(), {
    method: req.method,
    headers,
    body: outBody,
  });

  if (resp.status === 204 || resp.status === 304 || !resp.body) {
    return new Response(null, { status: resp.status, headers: resp.headers });
  }

  const contentType = resp.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream")) {
    const body = await resp.text();
    const fixed = body.replace(/"model":"[^/]+\/(claude-[^"]+)"/g, '"model":"$1"');
    return new Response(fixed, { status: resp.status, headers: resp.headers });
  } else {
    const body = await resp.text();
    try {
      const data = JSON.parse(body);
      if (data.model && data.model.includes("/")) {
        data.model = data.model.replace(/^[^/]+\//, "");
      }
      return new Response(JSON.stringify(data), { status: resp.status, headers: resp.headers });
    } catch {
      return new Response(body, { status: resp.status, headers: resp.headers });
    }
  }
});
