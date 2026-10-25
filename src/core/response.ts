/** Bound memory while reading, not after response.text() has allocated the complete body. */
export async function boundedText(
  response: Response,
  limit: number,
): Promise<string> {
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("responseTooLarge");
  if (!response.body) return "";
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let size = 0,
    text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("responseTooLarge");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
