-- Run this on EACH company database (e.g. AUTOSHOP (114))
-- Safe to run multiple times - checks before adding

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'rh_secut' AND COLUMN_NAME = 'logged_device_id'
)
BEGIN
  ALTER TABLE rh_secut ADD logged_device_id NVARCHAR(300) NULL;
  PRINT 'Added: logged_device_id';
END
ELSE PRINT 'Already exists: logged_device_id';

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'rh_secut' AND COLUMN_NAME = 'is_logged_in'
)
BEGIN
  ALTER TABLE rh_secut ADD is_logged_in BIT NOT NULL DEFAULT 0;
  PRINT 'Added: is_logged_in';
END
ELSE PRINT 'Already exists: is_logged_in';

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'rh_secut' AND COLUMN_NAME = 'last_login'
)
BEGIN
  ALTER TABLE rh_secut ADD last_login DATETIME NULL;
  PRINT 'Added: last_login';
END
ELSE PRINT 'Already exists: last_login';

-- Reset all sessions (run once to clear stale data)
UPDATE rh_secut SET is_logged_in = 0, logged_device_id = NULL;
PRINT 'All sessions cleared';

-- Verify
SELECT uti, is_logged_in, logged_device_id, last_login FROM rh_secut;
