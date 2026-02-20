import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

export const clienteSchema = z.object({
  nombre: z.string().min(2, 'Nombre requerido'),
  telefono: z.string().min(8, 'Teléfono inválido'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  notas: z.string().optional(),
})

export const servicioSchema = z.object({
  nombre: z.string().min(2, 'Nombre requerido'),
  descripcion: z.string().optional(),
  duracion_minutos: z.number().min(5, 'Mínimo 5 minutos'),
  precio_efectivo: z.number().min(0, 'Precio inválido'),
  precio_tarjeta: z.number().min(0, 'Precio inválido'),
})

export const profesionalSchema = z.object({
  nombre: z.string().min(2, 'Nombre requerido'),
  telefono: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  color: z.string().min(4, 'Color requerido'),
})

export const citaSchema = z.object({
  cliente_id: z.string().uuid('Seleccioná un cliente'),
  profesional_id: z.string().uuid('Seleccioná un profesional'),
  servicio_id: z.string().uuid('Seleccioná un servicio'),
  fecha_inicio: z.string().min(1, 'Fecha requerida'),
  metodo_pago: z.enum(['efectivo', 'tarjeta']),
  notas: z.string().optional(),
})

export const horarioSchema = z.object({
  dia_semana: z.number().min(0).max(6),
  hora_inicio: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  hora_fin: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
})

export type LoginInput = z.infer<typeof loginSchema>
export type ClienteInput = z.infer<typeof clienteSchema>
export type ServicioInput = z.infer<typeof servicioSchema>
export type ProfesionalInput = z.infer<typeof profesionalSchema>
export type CitaInput = z.infer<typeof citaSchema>
export type HorarioInput = z.infer<typeof horarioSchema>
