-- Seed admin user/account and a few sample emails for local D1.
-- Password for admin@example.com: Admin123

INSERT INTO user (email, password, salt, type, status, is_del, create_time, active_time)
SELECT
  'admin@example.com',
  'EBheRYlI9B6Hca9NH8Hcy2Bzhq89/wdDlbxi+5skpHg=',
  'QNqHQutUZyrdmg4VmQXiUg==',
  1,
  0,
  0,
  datetime('now'),
  datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM user WHERE email = 'admin@example.com');

INSERT INTO account (email, name, user_id)
SELECT
  'admin@example.com',
  'admin',
  user_id
FROM user
WHERE email = 'admin@example.com'
  AND NOT EXISTS (SELECT 1 FROM account WHERE email = 'admin@example.com');

INSERT INTO email (
  send_email, name, account_id, user_id, subject, text, content, recipient,
  to_email, to_name, type, status, unread, create_time, is_del
)
SELECT
  'hello@example.com',
  'Cloud Mail',
  account.account_id,
  user.user_id,
  '欢迎使用 Cloud Mail',
  '这是一封欢迎邮件，用于本地预览与分享功能演示。',
  '<div style="font-size:14px;line-height:1.6;">欢迎使用 <strong>Cloud Mail</strong>。<br>这是一封用于演示邮件预览分享功能的示例邮件。</div>',
  '[{"address":"admin@example.com","name":"Admin"}]',
  'admin@example.com',
  'Admin',
  0,
  0,
  1,
  datetime('now','-1 day'),
  0
FROM account
JOIN user ON user.user_id = account.user_id
WHERE account.email = 'admin@example.com'
  AND NOT EXISTS (SELECT 1 FROM email WHERE subject = '欢迎使用 Cloud Mail');

INSERT INTO email (
  send_email, name, account_id, user_id, subject, text, content, recipient,
  to_email, to_name, type, status, unread, create_time, is_del
)
SELECT
  'billing@example.com',
  'Billing Bot',
  account.account_id,
  user.user_id,
  '发票与附件示例',
  '这是一封包含附件说明的示例邮件。',
  '<div style="font-size:14px;line-height:1.6;">本邮件用于展示<strong>附件列表</strong>与邮件内容排版（附件可为空）。</div>',
  '[{"address":"admin@example.com","name":"Admin"}]',
  'admin@example.com',
  'Admin',
  0,
  0,
  1,
  datetime('now','-6 hour'),
  0
FROM account
JOIN user ON user.user_id = account.user_id
WHERE account.email = 'admin@example.com'
  AND NOT EXISTS (SELECT 1 FROM email WHERE subject = '发票与附件示例');

INSERT INTO email (
  send_email, name, account_id, user_id, subject, text, content, recipient,
  to_email, to_name, type, status, unread, create_time, is_del
)
SELECT
  'text-only@example.com',
  'Text Robot',
  account.account_id,
  user.user_id,
  '一封纯文本测试邮件',
  '纯文本内容示例：这封邮件没有 HTML，只用于验证文本渲染与预览分享。',
  '',
  '[{"address":"admin@example.com","name":"Admin"}]',
  'admin@example.com',
  'Admin',
  0,
  0,
  1,
  datetime('now','-2 hour'),
  0
FROM account
JOIN user ON user.user_id = account.user_id
WHERE account.email = 'admin@example.com'
  AND NOT EXISTS (SELECT 1 FROM email WHERE subject = '一封纯文本测试邮件');
