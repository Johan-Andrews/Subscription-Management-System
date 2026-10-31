const express = require('express');
const router = express.Router();

const templatesRoutes = require('./templates.routes');
const subscriptionsRoutes = require('./subscriptions.routes');

// Quotation templates
router.use('/quotation-templates', templatesRoutes);

// Subscriptions
router.use('/subscriptions', subscriptionsRoutes);

module.exports = router;