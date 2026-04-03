-- Grant admin to the primary operator account (existing rows only).
-- First-time logins for this email also receive admin via application logic in ValidateToken.
UPDATE users
SET is_admin = true
WHERE LOWER(TRIM(email)) = LOWER(TRIM('benediktreinhard@icloud.com'));
