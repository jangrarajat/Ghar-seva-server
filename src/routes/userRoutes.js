const express = require('express');
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { body } = require('express-validator');

const router = express.Router();

router.use(protect); // All routes require authentication

router.put('/profile', userController.updateProfile);
router.get('/addresses', userController.getAddresses);
router.post('/addresses', userController.addAddress);
router.put('/addresses/:addressId', userController.updateAddress);
router.delete('/addresses/:addressId', userController.deleteAddress);
router.patch('/addresses/:addressId/default', userController.setDefaultAddress);

router.put('/notification-preferences', userController.updateNotificationPreferences);

router.get('/wallet', userController.getWallet);
router.get('/notifications', userController.getNotifications);
router.patch('/notifications/:id/read', userController.markNotificationRead);
router.patch('/notifications/read-all', userController.markAllNotificationsRead);

module.exports = router;