-- Tabla de registro de actividad (audit log)
CREATE TABLE IF NOT EXISTS audit_log (
  id              uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  tabla           text          NOT NULL DEFAULT 'citas',
  accion          text          NOT NULL,  -- 'insert' | 'update' | 'delete'
  registro_id     uuid,
  datos_anteriores jsonb,
  datos_nuevos    jsonb,
  usuario_email   text,
  created_at      timestamptz   DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_registro_id_idx ON audit_log(registro_id);

-- Trigger function para citas
CREATE OR REPLACE FUNCTION fn_audit_citas()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log(tabla, accion, registro_id, datos_nuevos, usuario_email)
    VALUES ('citas', 'insert', NEW.id, to_jsonb(NEW), auth.email());
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log(tabla, accion, registro_id, datos_anteriores, datos_nuevos, usuario_email)
    VALUES ('citas', 'update', NEW.id, to_jsonb(OLD), to_jsonb(NEW), auth.email());
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log(tabla, accion, registro_id, datos_anteriores, usuario_email)
    VALUES ('citas', 'delete', OLD.id, to_jsonb(OLD), auth.email());
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_audit_citas ON citas;
CREATE TRIGGER tr_audit_citas
AFTER INSERT OR UPDATE OR DELETE ON citas
FOR EACH ROW EXECUTE FUNCTION fn_audit_citas();

-- RLS: solo acceso vía service_role (API route con admin client)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
