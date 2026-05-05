const express = require('express');
const providerController = require('../controllers/providerController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { body } = require('express-validator');

const router = express.Router();

// Public routes
router.get('/search', providerController.searchProviders);
router.get('/:id/public', providerController.getPublicProfile);

// Protected routes
router.use(protect);

router.post('/register', authorize('customer'), providerController.registerProvider);

// Provider routes
router.get('/profile', authorize('provider'), providerController.getProfile);
router.put('/profile', authorize('provider'), providerController.updateProfile);

router.post('/services', authorize('provider'), providerController.addService);
router.put('/services/:serviceId', authorize('provider'), providerController.updateService);
router.delete('/services/:serviceId', authorize('provider'), providerController.removeService);

router.put('/service-area', authorize('provider'), providerController.updateServiceArea);
router.post('/documents', authorize('provider'), providerController.uploadDocuments);
router.put('/bank-details', authorize('provider'), providerController.updateBankDetails);
router.get('/stats', authorize('provider'), providerController.getStats);

module.exports = router;