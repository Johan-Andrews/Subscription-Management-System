const app = require('./app');
const env = require('./config/env');
const { startScheduler } = require('./jobs/scheduler');

const server = app.listen(env.PORT, () => {
  console.log(`Brightloop Backend running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  startScheduler();
});

const shutdown = () => {
  console.log('Shutting down backend server...');
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = server;
