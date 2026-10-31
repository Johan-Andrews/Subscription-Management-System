const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 4000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  DATABASE_URL: process.env.DATABASE_URL || '',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  MAIL_FROM: process.env.MAIL_FROM || 'Brightloop <no-reply@brightloop.test>',
  CRON_ENABLED: process.env.CRON_ENABLED === 'true',
  BILLING_CRON: process.env.BILLING_CRON || '0 1 * * *',
  AUTO_CONFIRM_INVOICES: process.env.AUTO_CONFIRM_INVOICES === 'true',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@brightloop.test',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin@12345',
};

module.exports = env;
