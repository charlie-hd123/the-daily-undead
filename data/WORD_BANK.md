# Last Words catalogue

The game reads `word-puzzle-demo.json`. Each word is one independent entry:

```json
{
  "id": "lw-0552",
  "answer": "Mystery Box",
  "category": "Objects & Devices",
  "familiarity": "well_known",
  "availableFrom": "2026-10-20"
}
```

## Adding a word

1. Use a new permanent ID. Continue the numeric sequence and never reuse an old ID.
2. Enter the answer exactly as it should appear to players.
3. Assign its result category.
4. Assign `familiarity` as `well_known` or `less_known`.
5. Set `availableFrom` to the first UTC puzzle date on which it may appear.

The daily rotation uses an exact 80/20 cadence: four `well_known` words for every one
`less_known` word. Both pools are shuffled independently, so the cadence controls
difficulty without making the answer order predictable.

## Editing a word

Edit its answer, category, familiarity or dates, but keep its ID unchanged. The ID is the stable identity used by saved games and the daily rotation.

## Removing a word

If an unreleased entry is no longer wanted, it can be deleted. Once an entry has appeared in the game, keep it in the catalogue and add `retiredFrom` instead:

```json
{
  "id": "lw-0552",
  "answer": "Mystery Box",
  "category": "Objects & Devices",
  "familiarity": "well_known",
  "availableFrom": "2026-10-20",
  "retiredFrom": "2027-01-01"
}
```

`retiredFrom` is the first UTC date on which the word is no longer eligible. Keeping retired entries preserves historical puzzles and saved results.
