export function profileImageURL(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2048) return;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ((url.hostname === "pbs.twimg.com" &&
        url.pathname.startsWith("/profile_images/")) ||
        (url.hostname === "abs.twimg.com" &&
          url.pathname.startsWith("/sticky/default_profile_images/")))
    )
      return url.href;
  } catch {
    /* Ignore untrusted image addresses. */
  }
}

export function highResolutionCandidates(source: string): string[] {
  try {
    const url = new URL(source);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "pbs.twimg.com" ||
      !url.pathname.startsWith("/media/")
    )
      return [source];
    const extension = url.pathname.match(/\.(jpg|jpeg|png|webp)$/i)?.[1];
    if (extension) {
      url.pathname = url.pathname.replace(/\.(jpg|jpeg|png|webp)$/i, "");
      url.searchParams.set("format", extension.toLowerCase());
    }
    if (!url.searchParams.has("format")) return [source];
    return [
      ...new Set(
        ["4096x4096", "orig", "large"]
          .map((name) => {
            const candidate = new URL(url);
            candidate.searchParams.set("name", name);
            return candidate.href;
          })
          .concat(source),
      ),
    ];
  } catch {
    return [source];
  }
}
export function zoomAt(
  transform: { x: number; y: number; scale: number },
  factor: number,
  point: { x: number; y: number },
) {
  const scale = Math.max(0.05, Math.min(16, transform.scale * factor)),
    ratio = scale / transform.scale;
  return {
    x: point.x - (point.x - transform.x) * ratio,
    y: point.y - (point.y - transform.y) * ratio,
    scale,
  };
}
