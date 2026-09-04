export type AppointmentStatus = 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_asistio'
export type ReminderStatus = 'pendiente' | 'enviado' | 'fallido'

export interface Profesional {
  id: string
  user_id: string | null
  nombre: string
  telefono: string | null
  email: string | null
  color: string
  comision_porcentaje: number
  sueldo_fijo: number | null
  activo: boolean
  visible_calendario: boolean
  foto_url: string | null
  tolerancia_solapamiento_min?: number
  alias_pago?: string | null
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
  es_promo: boolean
  categoria?: 'manos' | 'pies' | 'pestanas' | 'cejas' | 'otros' | null
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
  apellido: string | null
  telefono: string
  dni: string | null
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
  precio_original: number | null            // precio antes de aplicar promo (si aplicó)
  promocion_aplicada_id: string | null      // referencia a promociones.id
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
  origen: string
  user_id: string | null
  created_at: string
}

export interface Bloqueo {
  id: string
  profesional_id: string
  fecha_inicio: string
  fecha_fin: string
  motivo: string
  created_at: string
}

export interface AuditLog {
  id: string
  tabla: string
  accion: string
  registro_id: string | null
  datos_anteriores: Record<string, unknown> | null
  datos_nuevos: Record<string, unknown> | null
  usuario_email: string | null
  created_at: string
}

export interface Promocion {
  id: string
  nombre: string
  descripcion: string | null
  // Descuento: uno de los tres. precios_override tiene prioridad.
  descuento_pct: number | null
  descuento_monto: number | null
  precios_override: Record<string, number> | null  // { servicio_id: precio_final }
  metodo_pago_requerido: 'efectivo' | 'mercadopago' | 'transferencia' | null
  dias_semana: number[] | null      // [0..6], 0=domingo, null=todos
  hora_desde: string | null         // "HH:MM:SS", null=todo el día
  hora_hasta: string | null
  fecha_desde: string | null        // "YYYY-MM-DD", null=sin límite
  fecha_hasta: string | null
  servicios_ids: string[] | null    // null=todos
  profesionales_ids: string[] | null
  imagen_url: string | null         // imagen del cartel (opcional, tipo Happy Hour)
  activa: boolean
  created_at: string
  updated_at: string
}

export interface Desbloqueo {
  id: string
  profesional_id: string
  fecha: string
  hora_inicio: string
  hora_fin: string
  motivo: string | null
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
  mensaje_reenganche?: string | null
  updated_at: string
}
