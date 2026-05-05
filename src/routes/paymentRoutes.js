const express = require('express');
const paymentController = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/create-order', paymentController.createOrder);
router.post('/verify', paymentController.verifyPayment);
router.get('/history', paymentController.getPaymentHistory);
router.post('/withdraw', paymentController.withdrawFromWallet);

// Webhook (no auth required)
router.post('/webhook', express.raw({ type: 'application/json' }), paymentController.webhook);

module.exports = router;