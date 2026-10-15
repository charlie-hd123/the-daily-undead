export async function fetchWithTimeout(
  input,
  options = {},
  { fetchImpl = globalThis.fetch, timeoutMs = 5_000 } = {},
) {
  const controller = new AbortController();
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = globalThis.setTimeout(() => {
      controller.abort();
      reject(new Error("Request timed out."));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetchImpl(input, { ...options, signal: controller.signal }),
      timeoutPromise,
    ]);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
