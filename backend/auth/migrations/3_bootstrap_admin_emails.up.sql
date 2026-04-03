-- Emails in this table are granted admin on first login (insert) and promoted for existing rows.
CREATE TABLE bootstrap_admin_emails (
  email TEXT PRIMARY KEY NOT NULL
);

INSERT INTO bootstrap_admin_emails (email)
VALUES ('benediktreinhard@icloud.com');

UPDATE users u
SET is_admin = true
FROM bootstrap_admin_emails b
WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(b.email));
