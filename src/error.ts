export async function ignore<T>(
  codes: string | string[],
  fn: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error: any) {
    if (
      Array.isArray(codes) ? codes.includes(error.code) : error.code === codes
    ) {
      return undefined;
    }
    throw error;
  }
}
