export type Params<T extends Record<string, string>> = { params: Promise<T> };
export type SearchParams = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};
