import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Pagina una query de Supabase para evitar el corte default de 1000 filas.
 *
 * Uso:
 *   const citas = await paginateQuery((from, to) =>
 *     supabase.from('citas').select('*').gte('fecha', '2026-01-01').range(from, to)
 *   )
 *
 * El builder recibe `(from, to)` y debe devolver la query con `.range(from, to)`.
 */
export async function paginateQuery<T>(
  builder: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
  maxRows = 50000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (from < maxRows) {
    const { data, error } = await builder(from, from + pageSize - 1)
    if (error || !data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}
