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

  // 请求侧:剥掉历史里的思考块(避免回传报错)
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
      headers.delete("content-length");
    } catch {
      outBody = req.body;
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
    // 流式:剔除 redacted_thinking 块(它是 thinking 的冗余副本)
    const body = await resp.text();
    const events = body.split("\n\n");
    const redactedIdx = new Set<number>();
    const out: string[] = [];

    for (const ev of events) {
      const dataLine = ev.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) { out.push(ev); continue; }
      const raw = dataLine.slice(6);
      let data: any;
      try { data = JSON.parse(raw); } catch { out.push(ev); continue; }

      // 记录 redacted_thinking 的 index,并丢弃它的 start 事件
      if (data.type === "content_block_start" && data.content_block?.type === "redacted_thinking") {
        redactedIdx.add(data.index);
        continue;
      }
      // 丢弃该 index 的 delta / stop
      if ((data.type === "content_block_delta" || data.type === "content_block_stop")
          && redactedIdx.has(data.index)) {
        continue;
      }

      // 修 model 名
      if (typeof data.model === "string" && data.model.includes("/")) {
        data.model = data.model.replace(/^[^/]+\//, "");
      }
      if (data.message && typeof data.message.model === "string" && data.message.model.includes("/")) {
        data.message.model = data.message.model.replace(/^[^/]+\//, "");
      }

      const eventLine = ev.split("\n").find((l) => l.startsWith("event: "));
      out.push((eventLine ? eventLine + "\n" : "") + "data: " + JSON.stringify(data));
    }

    return new Response(out.join("\n\n"), { status: resp.status, headers: resp.headers });
  } else {
    // 非流式:从 content 数组里剔除 redacted_thinking
    const body = await resp.text();
    try {
      const data = JSON.parse(body);
      if (typeof data.model === "string" && data.model.includes("/")) {
        data.model = data.model.replace(/^[^/]+\//, "");
      }
      if (Array.isArray(data.content)) {
        data.content = data.content.filter((b: any) => b?.type !== "redacted_thinking");
      }
      return new Response(JSON.stringify(data), { status: resp.status, headers: resp.headers });
    } catch {
      return new Response(body, { status: resp.status, headers: resp.headers });
    }
  }
});
