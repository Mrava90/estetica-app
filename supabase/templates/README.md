# Plantillas de mails de Supabase Auth

Estos mails los manda **Supabase**, no la app. Supabase no los lee de este repo:
hay que pegarlos a mano en el Dashboard → **Authentication → Emails → Templates**.
Están acá para tener la copia versionada y con el mismo estilo que el mail de
confirmación de turno (`src/app/api/notificar-turno/route.ts`).

| Plantilla en Supabase | Archivo | Asunto |
|---|---|---|
| Reset Password | `recovery.html` | Restablecé tu contraseña de Kawirth |
| Magic Link | `magic_link.html` | Tu acceso a Mis turnos · Kawirth |
| Invite user | `invite.html` | Te invitaron a la app de Kawirth |

Todas usan `{{ .ConfirmationURL }}`, el mismo enlace que la plantilla original:
el flujo de recuperar contraseña pasa por `/auth/confirm` y no hay que tocarlo.

Quién dispara cada una:
- Reset Password → "Olvidé mi contraseña" en `/login`
- Magic Link → acceso de clientas en `/reservar/mis-turnos`
- Invite user → alta de usuario en Configuración → Empleados
