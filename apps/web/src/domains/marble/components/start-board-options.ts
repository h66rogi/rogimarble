import type { RunnableBoardVersionDto } from "@rogimarble/contracts";

export function startBoardOptions(
  boards: readonly RunnableBoardVersionDto[],
  publishedVersionId: string | null,
): RunnableBoardVersionDto[] {
  const available = boards.filter((board) => !board.previewOnly);
  const published = available.find((board) => board.id === publishedVersionId);
  const ordered = published
    ? [published, ...available.filter((board) => board.id !== published.id)]
    : available;
  const seen = new Set<string>();
  return ordered.filter((board) => {
    if (seen.has(board.boardId)) return false;
    seen.add(board.boardId);
    return true;
  });
}
