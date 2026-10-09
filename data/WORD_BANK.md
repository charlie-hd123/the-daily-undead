# Last Words catalogue

The game reads `word-puzzle-demo.json`. Each word is one independent entry:

```json
{
  "id": "word-0091",
  "answer": "Mystery Box",
  "category": "Equipment & Buildables",
  "availableFrom": "2026-10-20"
}
```

## Adding a word

1. Use a new permanent ID. Continue the numeric sequence and never reuse an old ID.
2. Enter the answer exactly as it should appear to players.
3. Assign its result category.
4. Set `availableFrom` to the first UTC puzzle date on which it may appear.

## Editing a word

Edit its answer, category or dates, but keep its ID unchanged. The ID is the stable identity used by saved games and the daily rotation.

## Removing a word

If an unreleased entry is no longer wanted, it can be deleted. Once an entry has appeared in the game, keep it in the catalogue and add `retiredFrom` instead:

```json
{
  "id": "word-0091",
  "answer": "Mystery Box",
  "category": "Equipment & Buildables",
  "availableFrom": "2026-10-20",
  "retiredFrom": "2027-01-01"
}
```

`retiredFrom` is the first UTC date on which the word is no longer eligible. Keeping retired entries preserves historical puzzles and saved results.
