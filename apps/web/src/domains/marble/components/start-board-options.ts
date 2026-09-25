import type { RunnableBoardVersionDto } from "@rogimarble/contracts";

export function preferredStartBoard(
  boards: readonly RunnableBoardVersionDto[],
  publishedVersionId: string | null,
): RunnableBoardVersionDto | null {
  const available = boards.filter((board) => !board.previewOnly);
  if (publishedVersionId) return available.find((board) => board.id === publishedVersionId) ?? null;
  return available[0] ?? null;
}
