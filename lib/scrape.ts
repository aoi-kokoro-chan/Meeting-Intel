// Best-effort site scrape via Jina Reader. Returns "" on ANY failure — never throws.
export async function scrapeSite(url: string | null | undefined): Promise<string> {
  if (!url || !url.trim()) return "";
  let target = url.trim();
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://r.jina.ai/${target}`, {
      signal: controller.signal,
      headers: { Accept: "text/plain" },
    });
    clearTimeout(timer);
    if (!res.ok) return "";
    const text = await res.text();
    return text.slice(0, 6000);
  } catch {
    return "";
  }
}
