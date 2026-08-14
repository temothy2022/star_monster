import { createHash } from "node:crypto";

function dailyRank(seed: string, characterId: string) {
  return createHash("sha256")
    .update(seed)
    .update("\0")
    .update(characterId)
    .digest("hex");
}

export function selectDailyHanziCharacters<T extends { id: string }>(
  characters: T[],
  count: number,
  seed: string,
): T[] {
  if (count <= 0 || characters.length === 0) return [];
  return characters
    .map((character) => ({
      character,
      rank: dailyRank(seed, character.id),
    }))
    .sort(
      (left, right) =>
        left.rank.localeCompare(right.rank) ||
        left.character.id.localeCompare(right.character.id),
    )
    .slice(0, count)
    .map(({ character }) => character);
}

/**
 * Keep the parent's school list ahead of the normal rotating pool. Items that
 * are no longer in the enabled/unlearned pool are ignored, so a stale school
 * entry cannot block new content indefinitely.
 */
export function selectPrioritizedHanziCharacters<T extends { id: string }>(
  characters: T[],
  priorityIds: string[],
  count: number,
  seed: string,
): T[] {
  if (count <= 0 || characters.length === 0) return [];
  const byId = new Map(characters.map((character) => [character.id, character]));
  const priority = priorityIds.flatMap((id) => {
    const character = byId.get(id);
    return character ? [character] : [];
  });
  const priorityIdSet = new Set(priority.map((character) => character.id));
  const remaining = characters.filter((character) => !priorityIdSet.has(character.id));
  return [
    ...priority,
    ...selectDailyHanziCharacters(remaining, count, seed),
  ].slice(0, count);
}
