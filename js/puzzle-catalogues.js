import { fetchWithTimeout } from "./network.js?v=20261023-8";
import { puzzleCatalogueUrls } from "./puzzle-catalogue-assets.js?v=20261023-8";

export async function loadPuzzleCatalogues({ fetchImpl = globalThis.fetch } = {}) {
  // These paths include a content hash. Reusing a cached response cannot hide
  // updated puzzle data: a data change produces a different path.
  const responses = await Promise.all(
    [puzzleCatalogueUrls.maps, puzzleCatalogueUrls.words].map((url) =>
      fetchWithTimeout(url, { cache: "force-cache" }, { fetchImpl, timeoutMs: 8_000 })),
  );
  if (responses.some((response) => !response.ok)) {
    throw new Error("Could not load the puzzle catalogues.");
  }
  const [mapCatalogue, wordBank] = await Promise.all(responses.map((response) => response.json()));
  if (!Array.isArray(mapCatalogue.catalog?.maps) || !Array.isArray(mapCatalogue.maps)
    || mapCatalogue.maps.length !== mapCatalogue.catalog.maps.length) {
    throw new Error("The map catalogue is incomplete.");
  }
  return { ...mapCatalogue, wordBank };
}
