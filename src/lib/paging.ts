/** One page of a long list: the page asked for (1 if missing or nonsense), and where it starts. */
export function pageOf(raw: string | undefined, size: number): { page: number; skip: number; take: number } {
  const page = Math.max(1, Math.floor(Number(raw)) || 1);
  return { page, skip: (page - 1) * size, take: size };
}

export const pageCount = (total: number, size: number): number => Math.max(1, Math.ceil(total / size));
