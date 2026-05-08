const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

// Registration validation
const registerValidation = [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Invalid Indian phone number'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
];

// Login validation
const loginValidation = [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password is required')
];

// Routes
router.post('/register', validate(registerValidation), authController.register);
router.post('/login', validate(loginValidation), authController.login);

// Profile routes
router.get('/me', protect, authController.getMe);
router.post('/logout', protect, authController.logout);
router.post('/refresh-token', authController.refreshAccessToken);

module.exports = router;