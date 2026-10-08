# Plantillas de mails de Supabase Auth

Estos mails los manda **Supabase**, no la app. Supabase no los lee de este repo:
hay que pegarlos a mano en el Dashboard → **Authentication → Emails → Templates**.
Están acá para tener la copia versionada y con el mismo estilo que el mail de
confirmación de turno (`src/app/api/notificar-turno/route.ts`).

| Plantilla en Supabase | Archivo | Asunto |
|---|---|---|
| Reset Password | `recovery.html` | Restablecé tu contraseña de Kawirth |
| Magic Link | `magic_link.html` | **NO aplicada** (ver abajo) |
| Invite user | `invite.html` | Te invitaron a la app de Kawirth |

Todas usan `{{ .ConfirmationURL }}`, el mismo enlace que la plantilla original:
el flujo de recuperar contraseña pasa por `/auth/confirm` y no hay que tocarlo.

Quién dispara cada una:
- Reset Password → "Olvidé mi contraseña" en `/login`
- Magic Link → acceso de clientas en `/reservar/mis-turnos`
- Invite user → alta de usuario en Configuración → Empleados

## Estado (08/10/2026)

Reset Password e Invite user estan aplicadas en Supabase (via Management API).

Magic Link **no**: en Supabase ya hay una plantilla propia con el estilo de
Kawirth (asunto "Tu turno esta confirmado — Kawirth Ballester"). `magic_link.html`
queda como alternativa: la activa dice "tu reserva esta confirmada", pero ese
mail sale cuando una clienta pide entrar a /reservar/mis-turnos, no al reservar.
