const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { otpRateLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');

const router = express.Router();

// ✅ Fix: Proper validation without duplicate fields
const registerValidation = [
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('phone').matches(/^[6-9]\d{9}$/).withMessage('Invalid Indian phone number'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
];

const otpValidation = [
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
];

// Registration routes
router.post(
    '/register/send-otp',
    otpRateLimiter,
    validate(registerValidation),
    authController.registerSendOTP
);

router.post(
    '/register/verify-otp',
    validate([...registerValidation, ...otpValidation]),
    authController.registerVerifyOTP
);

// Login routes
router.post(
    '/login/send-otp',
    otpRateLimiter,
    validate([body('email').isEmail().withMessage('Valid email required')]),
    authController.loginSendOTP
);

router.post(
    '/login/verify-otp',
    validate([
        body('email').isEmail(),
        body('otp').isLength({ min: 6, max: 6 })
    ]),
    authController.loginVerifyOTP
);

// Profile routes
router.get('/me', protect, authController.getMe);
router.post('/logout', protect, authController.logout);
router.post('/refresh-token', authController.refreshAccessToken);

module.exports = router;