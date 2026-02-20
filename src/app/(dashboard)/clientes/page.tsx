'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Cliente } from '@/types/database'
import { formatFechaCorta } from '@/lib/dates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Eye } from 'lucide-react'

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [search, setSearch] = useState('')
  const supabase = createClient()

  useEffect(() => {
    fetchClientes()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchClientes() {
    let query = supabase.from('clientes').select('*').order('nombre').limit(100)
    if (search) {
      query = query.or(`nombre.ilike.%${search}%,telefono.ilike.%${search}%`)
    }
    const { data } = await query
    if (data) setClientes(data)
  }

  useEffect(() => {
    const timer = setTimeout(fetchClientes, 300)
    return () => clearTimeout(timer)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Clientes</h1>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o teléfono..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {search ? 'No se encontraron clientes' : 'No hay clientes registrados'}
                  </TableCell>
                </TableRow>
              )}
              {clientes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nombre}</TableCell>
                  <TableCell>{c.telefono}</TableCell>
                  <TableCell>{c.email || '-'}</TableCell>
                  <TableCell>{formatFechaCorta(c.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/clientes/${c.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
