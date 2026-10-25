// Compiler/editorial checks. Runtime requests consume the compiled pool instead.
export const BLOOD_TIES_FAIRNESS_VERSION = 2;

// A narrow category nested inside a broad one makes correct knowledge feel
// wrong. Avoid pairing categories sharing at least half of the smaller list.
export function bloodTiesCategoriesTooSimilar(a, b) {
  const shared = a.tiles.filter(tile => b.tiles.includes(tile)).length;
  return shared >= 2 && shared * 2 >= Math.min(a.tiles.length, b.tiles.length);
}

export function passesBloodTiesFairness(fairness) {
  return !fairness.alternative && fairness.easyClear && fairness.maxVisible <= 4
    && fairness.redHerringCount <= 2 && fairness.rejectedTrios <= 6 && !fairness.similarPairs.length;
}

export function trioMasks(indices) {
  const masks = [];
  for (let a = 0; a < indices.length - 2; a++)
    for (let b = a + 1; b < indices.length - 1; b++)
      for (let c = b + 1; c < indices.length; c++) masks.push((1 << indices[a]) | (1 << indices[b]) | (1 << indices[c]));
  return masks;
}

export function createBloodTiesFairnessChecker(connections) {
  const memberships = new Map();
  for (const group of connections) for (const tile of group.tiles) {
    if (!memberships.has(tile)) memberships.set(tile, []);
    memberships.get(tile).push(group.id);
  }
  return function inspect(groups) {
    const tiles = groups.flatMap(g => g.answers);
    if (groups.length !== 4 || tiles.length !== 12 || new Set(tiles).size !== 12) throw new Error('Fairness checks require four distinct trios.');
    const intended = new Set(groups.map(g => g.answers.reduce((mask,t) => mask | (1 << tiles.indexOf(t)), 0)));
    const visible = new Map();
    tiles.forEach((tile,i) => {
      for (const id of memberships.get(tile) || []) {
        if (!visible.has(id)) visible.set(id, []);
        visible.get(id).push(i);
      }
    });
    const labels = new Map();
    for (const [id,indices] of visible) for (const mask of trioMasks(indices)) {
      if (!labels.has(mask)) labels.set(mask, []);
      labels.get(mask).push(id);
    }
    // Enumerate physical partitions once, regardless of the labels or solve order.
    // A matching label assignment must use four different category IDs.
    function distinctLabels(masks, index = 0, used = new Set()) {
      if (index === masks.length) return true;
      for (const id of labels.get(masks[index])) if (!used.has(id)) {
        used.add(id);
        if (distinctLabels(masks, index + 1, used)) return true;
        used.delete(id);
      }
      return false;
    }
    const byTile = tiles.map((_,i) => [...labels.keys()].filter(mask => mask & (1 << i)));
    function alternative(used, masks) {
      if (used === 4095) return !masks.every(mask => intended.has(mask))
        && distinctLabels([...masks].sort((a,b) => labels.get(a).length - labels.get(b).length));
      let i = 0; while (used & (1 << i)) i++;
      return byTile[i].some(mask => !(mask & used) && alternative(used | mask, [...masks, mask]));
    }
    const counts = groups.map(g => (visible.get(g.id) || []).length);
    return {
      alternative: alternative(0, []),
      // Include unchosen categories: players can spot those connections too.
      maxVisible: Math.max(...[...visible.values()].map(indices => indices.length)),
      maxChosenVisible: Math.max(...counts),
      easyClear: groups.filter(g => g.difficulty === 1).every(g => visible.get(g.id)?.length === 3),
      rejectedTrios: [...labels.keys()].filter(mask => !intended.has(mask)).length,
      redHerringCount: tiles.filter(tile => groups.some(g => !g.answers.includes(tile) && g.tiles.includes(tile))).length,
      similarPairs: groups.flatMap((g,i) => groups.slice(i+1).filter(h => bloodTiesCategoriesTooSimilar(g,h)).map(h => [g.id,h.id])),
    };
  };
}
