export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items.entries()];
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length || 1)) },
    async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        await fn(next[1]);
      }
    },
  );
  await Promise.all(workers);
}
