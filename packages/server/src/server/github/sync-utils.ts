export function findUnstarredRepoIds(existingIds: string[], syncedIds: string[]) {
  const synced = new Set(syncedIds);
  return existingIds.filter((id) => !synced.has(id));
}
