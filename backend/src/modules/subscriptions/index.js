const express = require('express');
const router = express.Router();

const templatesRoutes = require('./templates.routes');

// Quotation templates
router.use('/quotation-templates', templatesRoutes);

// Subscriptions routes will be added here in Task C2
// router.use('/subscriptions', subscriptionsRoutes);

module.exports = router;
