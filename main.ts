Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // 路径转换：Anthropic 格式 → OpenRouter 格式
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

  // 修复响应：去掉 model 字段里的 provider 前缀
  const contentType = resp.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream")) {
    // 流式响应：逐行处理 SSE
    const reader = resp.body?.getReader();
    if (!reader) return resp;

    const stream = new ReadableStream({
      async start(controller) {
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.model) {
                  data.model = data.model.replace(/^[^/]+\//, "");
                }
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
              } catch {
                controller.enqueue(new TextEncoder().encode(line + "\n"));
              }
            } else {
              controller.enqueue(new TextEncoder().encode(line + "\n"));
            }
          }
        }
        // 处理剩余 buffer
        if (buffer) controller.enqueue(new TextEncoder().encode(buffer));
        controller.close();
      },
    });

    return new Response(stream, {
      status: resp.status,
      headers: resp.headers,
    });
  } else {
    // 普通响应：JSON 解析后修复
    const body = await resp.text();
    try {
      const data = JSON.parse(body);
      if (data.model) {
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
