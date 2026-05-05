const express = require('express');
const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.use(authorize('admin'));

// Dashboard
router.get('/dashboard', adminController.getDashboardStats);

// User management
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUserDetails);
router.patch('/users/:id/status', adminController.updateUserStatus);

// Verifications
router.get('/verifications', adminController.getPendingVerifications);
router.patch('/verifications/:id', adminController.verifyProvider);

// Category management
router.post('/categories', adminController.createCategory);
router.put('/categories/:id', adminController.updateCategory);
router.delete('/categories/:id', adminController.deleteCategory);

// Service management
router.post('/services', adminController.createService);
router.put('/services/:id', adminController.updateService);
router.delete('/services/:id', adminController.deleteService);

// Bookings
router.get('/bookings', adminController.getAllBookings);

// Reviews
router.patch('/reviews/:id', adminController.moderateReview);

// Reports
router.get('/reports/revenue', adminController.getRevenueReport);

module.exports = router;