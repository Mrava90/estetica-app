export type AppointmentStatus = 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_asistio'
export type ReminderStatus = 'pendiente' | 'enviado' | 'fallido'

export interface Profesional {
  id: string
  user_id: string | null
  nombre: string
  telefono: string | null
  email: string | null
  color: string
  activo: boolean
  created_at: string
  updated_at: string
}

export type MetodoPago = 'efectivo' | 'mercadopago' | 'transferencia'

export interface Servicio {
  id: string
  nombre: string
  descripcion: string | null
  duracion_minutos: number
  precio_efectivo: number
  precio_mercadopago: number
  activo: boolean
  created_at: string
  updated_at: string
}

export interface ProfesionalServicio {
  profesional_id: string
  servicio_id: string
}

export interface Cliente {
  id: string
  nombre: string
  telefono: string
  email: string | null
  notas: string | null
  created_at: string
  updated_at: string
}

export interface Horario {
  id: string
  profesional_id: string
  dia_semana: number
  hora_inicio: string
  hora_fin: string
  activo: boolean
}

export interface Cita {
  id: string
  cliente_id: string | null
  profesional_id: string | null
  servicio_id: string | null
  fecha_inicio: string
  fecha_fin: string
  status: AppointmentStatus
  notas: string | null
  precio_cobrado: number | null
  metodo_pago: string
  origen: string
  created_at: string
  updated_at: string
}

export interface CitaConRelaciones extends Cita {
  clientes: Cliente | null
  profesionales: Profesional | null
  servicios: Servicio | null
}

export interface Recordatorio {
  id: string
  cita_id: string
  tipo: string
  status: ReminderStatus
  enviado_at: string | null
  error_mensaje: string | null
  created_at: string
}

export interface MovimientoCaja {
  id: string
  fecha: string
  monto: number
  tipo: 'efectivo' | 'mercadopago'
  descripcion: string
  user_id: string | null
  created_at: string
}

export interface Configuracion {
  id: number
  nombre_salon: string
  telefono: string | null
  direccion: string | null
  zona_horaria: string
  intervalo_citas_minutos: number
  dias_anticipacion_reserva: number
  mensaje_confirmacion: string | null
  mensaje_recordatorio: string | null
  updated_at: string
}
