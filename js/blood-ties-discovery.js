// Editorial guidance, compiled into boards ahead of time. No AI runs in the game.
export const BLOOD_TIES_DISCOVERY_VERSION = 2;
export const BLOOD_TIES_DISCOVERY_METHODS = ['name', 'familiar', 'specialist'];
export const BLOOD_TIES_REASONING_TYPES = ['function', 'trait', 'weapon-class'];

const normal = value => value.normalize('NFKC').toLowerCase().replaceAll('’', "'");
export function validateBloodTiesDiscovery(group) {
  const d = group.discovery;
  if (!d || !BLOOD_TIES_DISCOVERY_METHODS.includes(d.method)) throw new Error(`Category ${group.id} needs a discovery classification: name, familiar or specialist.`);
  if (d.reasoning && (!BLOOD_TIES_REASONING_TYPES.includes(d.reasoning) || d.method === 'specialist')) throw new Error(`Category ${group.id} needs a non-specialist reasoning type: function, trait or weapon-class.`);
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

export function resolveBloodTiesTrioDiscovery(group) {
  validateBloodTiesDiscovery(group);
  // A category can be obvious from some names but factual for other draws.
  // Retain every eligible answer; never promise a name clue it does not carry.
  if (group.discovery.method === 'name' && !group.answers.every(t => bloodTiesClueTiles(group).includes(t))) {
    return { ...group, discovery: { ...group.discovery, method: 'familiar' } };
  }
  return group;
}

// Weapons and Wonder Weapons are not distinguishable object types to a player.
const kind = group => ['Weapons', 'Wonder Weapons'].includes(group.family) ? 'Weapons'
  : ['GobbleGums', 'Elixirs'].includes(group.family) ? 'Consumables' : group.family;
const approachable = group => group.discovery.method === 'name' || Boolean(group.discovery.reasoning);
const words = text => normal(text).match(/[a-z]+/g)?.map(word => word.replace(/s$/, '')) || [];
const generic = new Set(['map','with','that','have','enemy','enemie','type','weapon','wonder','introduced','black','zombie','playable','character']);
function misleadingTraitName(group, other) {
  if (group.discovery.reasoning !== 'trait' || kind(group) !== kind(other)) return false;
  const cues = words(group.name).filter(word => word.length >= 4 && !generic.has(word));
  // Do not pair a lighthouse category with a non-member literally named
  // "Lighthouse". This rejects the pairing without inventing new memberships.
  return other.answers.some(tile => !group.tiles.includes(tile) && words(tile).some(word => cues.includes(word)));
}
export const isBloodTiesLiteralGroup = group => group.discovery.method === 'name'
  && group.discovery.words.some(word => group.answers.every(tile => normal(tile).includes(normal(word))));
export function inspectBloodTiesDiscovery(groups) {
  groups.forEach(validateBloodTiesDiscovery);
  const nameGroups = groups.filter(g => g.discovery.method === 'name');
  const pairs = groups.flatMap((g,i) => groups.slice(i+1).map(h => [g,h]));
  const finishes = pairs.map(([g,h]) => {
    const sameKind = kind(g) === kind(h);
    const specialist = [g,h].find(group => group.discovery.method === 'specialist');
    const partner = specialist === g ? h : g;
    const sameTheme = g.discovery.method === 'name' && h.discovery.method === 'name'
      && normal(g.discovery.theme) === normal(h.discovery.theme);
    const specialistSplit = !specialist || !sameKind || (approachable(partner)
      && [...g.answers,...h.answers].filter(tile => partner.tiles.includes(tile)).length === 3);
    return { groups: [g.id,h.id], discoverable: !sameTheme && !misleadingTraitName(g,h) && !misleadingTraitName(h,g) && specialistSplit
      && (!sameKind || approachable(g) || approachable(h)) };
  });
  return {
    specialistGroups: groups.filter(g => g.discovery.method === 'specialist').length,
    nameGroups: nameGroups.length,
    approachableGroups: groups.filter(approachable).length,
    literalGroups: groups.filter(isBloodTiesLiteralGroup).length,
    clueTiles: nameGroups.every(g => g.answers.every(t => bloodTiesClueTiles(g).includes(t))),
    finishes,
    // Prefer related items at the opening, without sacrificing the finish.
    isolatedGroups: groups.filter(g => groups.filter(h => kind(h) === kind(g)).length === 1).length,
  };
}

export function passesBloodTiesDiscovery(review) {
  // Retain every category. Limit how specialist knowledge is combined, rather
  // than retiring those categories from the player's daily puzzle pool.
  return review.specialistGroups <= 1 && review.approachableGroups >= 2 && review.literalGroups <= 1
    && review.clueTiles && review.finishes.every(pair => pair.discoverable);
}
