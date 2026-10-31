const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors({
  origin: env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());

if (env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.get('/api/health', (req, res) => {
  res.json({ data: { ok: true } });
});

const modules = [
  'auth',
  'users',
  'catalog',
  'subscriptions',
  'billing',
  'invoices',
  'payments',
  'reports',
];

modules.forEach((m) => {
  app.use('/api', require(`./modules/${m}`));
});

app.use(errorHandler);

module.exports = app;

