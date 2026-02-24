-- Enable Realtime on citas table so the calendar updates
-- automatically when a client books online
ALTER PUBLICATION supabase_realtime ADD TABLE citas;
