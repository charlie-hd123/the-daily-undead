import { bloodTiesCatalogueQuarter, readCompiledBloodTiesPuzzle } from './blood-ties-compiled.js';
import { bloodTiesCatalogueUrls } from './blood-ties-catalogue-assets.js?v=20261108-5';

export { createBloodTiesSession, normalizeBloodTiesSession, replayBloodTiesAttempts } from './blood-ties-rules.js';

async function loadCatalogue(url, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetchImpl(url, { cache: 'force-cache', signal: controller.signal });
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    // An unexpected response must never supply a board for an existing save.
    const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    const hex = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    if (!url.endsWith(`.${hex}.json`)) return null;
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadBloodTiesPuzzles(dateKeys, { production, fetchImpl = globalThis.fetch }) {
  const environment = production ? 'production' : 'staging';
  const urls = bloodTiesCatalogueUrls[environment];
  const assets = new Map();
  return Promise.all(dateKeys.map(async (dateKey) => {
    const url = urls[bloodTiesCatalogueQuarter(dateKey)];
    if (url) {
      if (!assets.has(url)) assets.set(url, loadCatalogue(url, fetchImpl));
      const catalogue = await assets.get(url);
      if (catalogue?.environment === environment) {
        const puzzle = readCompiledBloodTiesPuzzle(catalogue, catalogue.days, dateKey);
        if (puzzle) return puzzle;
      }
    }
    // Keep the original schedule available for dates outside the compiled range
    // and for pages that cannot fetch or verify a package.
    const { buildDailyBloodTiesPuzzle } = await import('./blood-ties-core.js?v=20261108-5');
    return buildDailyBloodTiesPuzzle(dateKey, { production });
  }));
}
