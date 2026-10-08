'use client'

import { useEffect, useState } from 'react'
import { Mail, Clock, CheckCircle, XCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type ClienteAcceso = {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  email_confirmed_at: string | null
}

export default function AccesosPage() {
  const [usuarios, setUsuarios] = useState<ClienteAcceso[]>([])
  const [loading, setLoading] = useState(true)
  const [eliminando, setEliminando] = useState<string | null>(null)

  useEffect(() => {
    fetchUsuarios()
  }, [])

  async function fetchUsuarios() {
    setLoading(true)
    const res = await fetch('/api/accesos')
    if (res.ok) {
      const data = await res.json()
      setUsuarios(data.usuarios || [])
    }
    setLoading(false)
  }

  async function handleEliminar(id: string, email: string) {
    if (!confirm(`¿Eliminar acceso de ${email}?`)) return
    setEliminando(id)
    const res = await fetch('/api/accesos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setEliminando(null)
    if (res.ok) {
      setUsuarios((prev) => prev.filter((u) => u.id !== id))
      toast.success('Acceso eliminado')
    } else {
      toast.error('Error al eliminar')
    }
  }

  function formatFecha(fecha: string | null) {
    if (!fecha) return '—'
    return new Date(fecha).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Accesos de clientes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Clientes que usaron el link para ver sus turnos
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : usuarios.length === 0 ? (
        <div className="rounded-xl border p-8 text-center text-muted-foreground text-sm">
          Ningún cliente ha usado el acceso por link todavía
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Registrado</th>
                <th className="text-left px-4 py-3 font-medium">Último acceso</th>
                <th className="text-left px-4 py-3 font-medium">Verificado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium">{u.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {formatFecha(u.created_at)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.last_sign_in_at ? formatFecha(u.last_sign_in_at) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {u.email_confirmed_at ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                        <CheckCircle className="h-3.5 w-3.5" /> Sí
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-gray-400 text-xs">
                        <XCircle className="h-3.5 w-3.5" /> No
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleEliminar(u.id, u.email)}
                      disabled={eliminando === u.id}
                      className="text-red-500 hover:text-red-700 disabled:opacity-40"
                      title="Eliminar acceso"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
