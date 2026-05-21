-- Add alisa.mehler@outlook.com as a bootstrap admin.
-- She will receive admin rights on first login.
INSERT INTO bootstrap_admin_emails (email)
VALUES ('alisa.mehler@outlook.com')
ON CONFLICT (email) DO NOTHING;

UPDATE users u
SET is_admin = true
FROM bootstrap_admin_emails b
WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(b.email));
