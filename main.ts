Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  url.hostname = "openrouter.ai";
  
  const headers = new Headers(req.headers);
  const apiKey = headers.get("x-api-key");
  if (apiKey) {
    headers.delete("x-api-key");
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  headers.delete("anthropic-version");
  
  return fetch(url.toString(), {
    method: req.method,
    headers,
    body: req.body,
  });
});
