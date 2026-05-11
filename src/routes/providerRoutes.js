const express = require('express');
const providerController = require('../controllers/providerController');
const withdrawalController = require('../controllers/withdrawalController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { body } = require('express-validator');

const router = express.Router();

// Public routes
router.get('/search', providerController.searchProviders);
router.get('/:id/public', providerController.getPublicProfile);

// Protected routes (require authentication)
router.use(protect);

// Provider registration (customer to provider)
router.post('/register', authorize('customer'), providerController.registerProvider);

// Provider profile
router.get('/profile', authorize('provider'), providerController.getProfile);
router.put('/profile', authorize('provider'), providerController.updateProfile);
router.get('/stats', authorize('provider'), providerController.getStats);

// Provider services management
router.post('/services', authorize('provider'), providerController.addService);
router.put('/services/:serviceId', authorize('provider'), providerController.updateService);
router.delete('/services/:serviceId', authorize('provider'), providerController.removeService);

// Service area & documents
router.put('/service-area', authorize('provider'), providerController.updateServiceArea);
router.post('/documents', authorize('provider'), providerController.uploadDocuments);
router.put('/bank-details', authorize('provider'), providerController.updateBankDetails);

// Notifications for provider
router.get('/notifications', authorize('provider'), providerController.getNotifications);
router.patch('/notifications/:id/read', authorize('provider'), providerController.markNotificationRead);

// ========== WITHDRAWAL REQUESTS ==========
router.post('/withdrawals/request', authorize('provider'), withdrawalController.requestWithdrawal);
router.get('/withdrawals/my', authorize('provider'), withdrawalController.getMyWithdrawals);

module.exports = router;