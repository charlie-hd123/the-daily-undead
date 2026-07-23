import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const mapsDirectory = new URL("../data/maps/", import.meta.url);

async function readJson(filename) {
  return JSON.parse(await fs.readFile(new URL(filename, mapsDirectory), "utf8"));
}

test("the manifest contains all games and maps from the updated workbook", async () => {
  const catalog = await readJson("index.json");

  assert.deepEqual(
    catalog.games.map((game) => game.title),
    [
      "World at War",
      "Black Ops",
      "Black Ops 2",
      "Black Ops 3",
      "Black Ops 4",
      "Black Ops Cold War",
      "Black Ops 6",
      "Black Ops 7",
    ],
  );
  assert.equal(catalog.maps.length, 37);
  assert.deepEqual(
    catalog.selectionOnlyMaps.map((map) => map.title),
    [
      "Nacht der Untoten",
      "Verrückt",
      "Shi No Numa",
      "Kino Der Toten",
      "\"Five\"",
      "Nuketown Zombies",
      "The Giant",
      "Classified",
      "Outbreak",
    ],
  );
});

test("every selectable map keeps its official spelling and capitalisation", async () => {
  const catalog = await readJson("index.json");
  const answerMaps = await Promise.all(catalog.maps.map((filename) => readJson(filename)));
  const mapsById = new Map(
    [...answerMaps, ...catalog.selectionOnlyMaps].map((map) => [map.id, map.title]),
  );

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(catalog.mapOrder).map(([gameId, mapIds]) => [
        gameId,
        mapIds.map((mapId) => mapsById.get(mapId)),
      ]),
    ),
    {
      waw: ["Nacht der Untoten", "Verrückt", "Shi No Numa", "Der Riese"],
      bo1: ["Kino Der Toten", "\"Five\"", "Ascension", "Call of the Dead", "Shangri-La", "Moon"],
      bo2: ["TranZit", "Nuketown Zombies", "Die Rise", "Mob of the Dead", "Buried", "Origins"],
      bo3: [
        "Shadows of Evil",
        "The Giant",
        "Der Eisendrache",
        "Zetsubou No Shima",
        "Gorod Krovi",
        "Revelations",
      ],
      bo4: [
        "Voyage of Despair",
        "IX",
        "Blood of the Dead",
        "Classified",
        "Dead of the Night",
        "Ancient Evil",
        "Alpha Omega",
        "Tag der Toten",
      ],
      "cold-war": ["Die Maschine", "Firebase Z", "Outbreak", "Mauer der Toten", "Forsaken"],
      bo6: [
        "Terminus",
        "Liberty Falls",
        "Citadelle des Morts",
        "The Tomb",
        "Shattered Veil",
        "Reckoning",
      ],
      bo7: ["Ashes of the Damned", "Astra Malorum", "Paradox Junction", "Totenreich", "Kowakujō"],
    },
  );
});

test("every manifest map is valid and belongs to a selectable game", async () => {
  const catalog = await readJson("index.json");
  const gameIds = new Set(catalog.games.map((game) => game.id));
  const mapIds = new Set();
  let stepCount = 0;

  for (const filename of catalog.maps) {
    const map = await readJson(filename);

    assert.equal(gameIds.has(map.gameId), true, `${filename} has an unknown gameId`);
    assert.equal(mapIds.has(map.id), false, `${filename} has a duplicate map id`);
    assert.equal(map.steps.length >= 3, true, `${filename} needs at least three steps`);
    assert.deepEqual(
      map.steps.map((step) => step.order),
      map.steps.map((_, index) => index + 1),
      `${filename} steps must be in chronological order`,
    );
    assert.equal(
      new Set(map.steps.map((step) => step.id)).size,
      map.steps.length,
      `${filename} has duplicate step ids`,
    );

    mapIds.add(map.id);
    stepCount += map.steps.length;
  }

  assert.equal(stepCount, 259);

  const jsonFiles = (await fs.readdir(mapsDirectory))
    .filter((filename) => filename.endsWith(".json") && filename !== "index.json")
    .sort();
  assert.deepEqual(jsonFiles, [...catalog.maps].sort(), "every map JSON should be in the manifest");
});

test("selectable-only maps are ordered but excluded from the answer files", async () => {
  const catalog = await readJson("index.json");
  const answerMaps = await Promise.all(catalog.maps.map((filename) => readJson(filename)));
  const answerMapIds = new Set(answerMaps.map((map) => map.id));
  const selectionOnlyIds = new Set(catalog.selectionOnlyMaps.map((map) => map.id));
  const orderedIds = Object.values(catalog.mapOrder).flat();

  assert.equal(selectionOnlyIds.size, 9);
  for (const map of catalog.selectionOnlyMaps) {
    assert.equal(answerMapIds.has(map.id), false, `${map.title} must not enter the answer pool`);
    assert.equal(/^\d{4}-\d{2}-\d{2}$/.test(map.releaseDate), true);
  }

  assert.equal(new Set(orderedIds).size, orderedIds.length, "map ordering contains duplicates");
  assert.deepEqual(
    [...new Set([...answerMapIds, ...selectionOnlyIds])].sort(),
    [...orderedIds].sort(),
    "map ordering should contain every selectable map exactly once",
  );
});

test("Der Riese accepts The Giant as its only cross-map equivalent", async () => {
  const catalog = await readJson("index.json");

  assert.deepEqual(catalog.answerEquivalents, [
    {
      answerMapId: "waw-der-riese",
      acceptedMapIds: ["waw-der-riese", "bo3-the-giant"],
      displayTitle: "Der Riese / The Giant",
    },
  ]);
});
