-- Extender audit_log para capturar cambios en bloqueos, desbloqueos y horarios.
-- Antes solo se auditaban citas — cuando Fabi cargaba/eliminaba un bloqueo temporal
-- (patrón frecuente para "cerrar antes"), no quedaba rastro.

-- Función genérica que replica el patrón de fn_audit_citas pero con `tabla` dinámico.
CREATE OR REPLACE FUNCTION fn_audit_generic()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log(tabla, accion, registro_id, datos_nuevos, usuario_email)
    VALUES (TG_TABLE_NAME, 'insert', NEW.id, to_jsonb(NEW), auth.email());
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log(tabla, accion, registro_id, datos_anteriores, datos_nuevos, usuario_email)
    VALUES (TG_TABLE_NAME, 'update', NEW.id, to_jsonb(OLD), to_jsonb(NEW), auth.email());
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log(tabla, accion, registro_id, datos_anteriores, usuario_email)
    VALUES (TG_TABLE_NAME, 'delete', OLD.id, to_jsonb(OLD), auth.email());
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_audit_bloqueos ON bloqueos;
CREATE TRIGGER tr_audit_bloqueos
AFTER INSERT OR UPDATE OR DELETE ON bloqueos
FOR EACH ROW EXECUTE FUNCTION fn_audit_generic();

DROP TRIGGER IF EXISTS tr_audit_desbloqueos ON desbloqueos;
CREATE TRIGGER tr_audit_desbloqueos
AFTER INSERT OR UPDATE OR DELETE ON desbloqueos
FOR EACH ROW EXECUTE FUNCTION fn_audit_generic();

DROP TRIGGER IF EXISTS tr_audit_horarios ON horarios;
CREATE TRIGGER tr_audit_horarios
AFTER INSERT OR UPDATE OR DELETE ON horarios
FOR EACH ROW EXECUTE FUNCTION fn_audit_generic();
