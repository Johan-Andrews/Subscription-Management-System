const express = require('express');

const router = express.Router();

router.use(require('./taxes.routes'));
router.use(require('./products.routes'));
router.use(require('./plans.routes'));

module.exports = router;
