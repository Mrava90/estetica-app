export type CategoriaServicio = 'manos' | 'pies' | 'pestanas' | 'cejas' | 'otros'

export const CATEGORIA_LABELS: Record<CategoriaServicio, string> = {
  manos: 'Manos',
  pies: 'Pies',
  pestanas: 'Pestañas',
  cejas: 'Cejas',
  otros: 'Otros',
}

export const CATEGORIAS_ORDEN: CategoriaServicio[] = ['manos', 'pies', 'pestanas', 'cejas', 'otros']

/**
 * Devuelve la categoría del servicio.
 * Si el servicio tiene un override manual en `categoria`, se usa ese.
 * Sino, heurística por nombre.
 */
export function getCategoria(nombre: string, categoria?: string | null): CategoriaServicio {
  if (categoria && (CATEGORIAS_ORDEN as string[]).includes(categoria)) {
    return categoria as CategoriaServicio
  }
  const n = nombre.toLowerCase()
  if (n.includes('pesta') || n.includes('lifting') || n.includes('botox') || n.includes('rimmel') || n.includes('2d') || n.includes('3d') || n.includes('mega volumen') || n.includes('retirado de maquillaje')) return 'pestanas'
  if (n.includes('ceja') || n.includes('henna') || n.includes('laminado') || n.includes('perfilado')) return 'cejas'
  if (n.includes('pies') || n.includes('belleza de pie')) return 'pies'
  if (n.includes('manos') || n.includes('kapping') || n.includes('semi') || n.includes('esmaltado') || n.includes('remocion') || n.includes('acrilico') || n.includes('gel')) return 'manos'
  return 'otros'
}
