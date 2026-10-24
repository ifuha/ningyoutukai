UPDATE "tasks"
SET "status" = CASE
  WHEN "completed_at" IS NOT NULL THEN 'completed'
  WHEN "reported_at" IS NOT NULL THEN 'reported'
  ELSE 'in_progress'
END;
