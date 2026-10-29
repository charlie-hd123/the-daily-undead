// Editorial guidance, compiled into boards ahead of time. No AI runs in the game.
export const BLOOD_TIES_DISCOVERY_VERSION = 1;
export const BLOOD_TIES_DISCOVERY_METHODS = ['name', 'familiar', 'specialist'];

const normal = value => value.normalize('NFKC').toLowerCase().replaceAll('’', "'");
export function validateBloodTiesDiscovery(group) {
  const d = group.discovery;
  if (!d || !BLOOD_TIES_DISCOVERY_METHODS.includes(d.method)) throw new Error(`Category ${group.id} needs a discovery classification: name, familiar or specialist.`);
  if (d.method === 'name' && (!d.theme?.trim() || !Array.isArray(d.words) || !d.words.length || d.words.some(w => typeof w !== 'string' || !w.trim()))) {
    throw new Error(`Category ${group.id} needs a name theme and clue words.`);
  }
}

export function bloodTiesClueTiles(group) {
  validateBloodTiesDiscovery(group);
  return group.discovery.method === 'name'
    ? group.tiles.filter(tile => group.discovery.words.some(word => normal(tile).includes(normal(word))))
    : [...group.tiles];
}

// Weapons and Wonder Weapons are not distinguishable object types to a player.
const kind = group => ['Weapons', 'Wonder Weapons'].includes(group.family) ? 'Weapons' : group.family;
export function inspectBloodTiesDiscovery(groups) {
  groups.forEach(validateBloodTiesDiscovery);
  const nameGroups = groups.filter(g => g.discovery.method === 'name');
  const pairs = groups.flatMap((g,i) => groups.slice(i+1).map(h => [g,h]));
  const finishes = pairs.map(([g,h]) => ({
    groups: [g.id,h.id],
    // Same-theme groups still require hidden knowledge to distinguish, even if
    // both sets of names visibly suggest (for example) gods or machine parts.
    discoverable: !(g.discovery.method === 'name' && h.discovery.method === 'name'
      && normal(g.discovery.theme) === normal(h.discovery.theme))
      && (g.discovery.method === 'name' || h.discovery.method === 'name' || kind(g) !== kind(h)),
  }));
  return {
    regular: groups.every(g => g.discovery.method !== 'specialist'),
    nameGroups: nameGroups.length,
    clueTiles: nameGroups.every(g => g.answers.every(t => bloodTiesClueTiles(g).includes(t))),
    finishes,
    // Prefer related items at the opening, without sacrificing the finish.
    isolatedGroups: groups.filter(g => groups.filter(h => kind(h) === kind(g)).length === 1).length,
  };
}

export function passesBloodTiesDiscovery(review) {
  return review.regular && review.nameGroups >= 1 && review.clueTiles && review.finishes.every(pair => pair.discoverable);
}
