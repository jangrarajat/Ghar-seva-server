// routes/authRoutes.js

const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

// ============ Validation Rules ============

// Registration validation
const registerValidation = [
    body('firstName')
        .trim()
        .notEmpty()
        .withMessage('First name is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('First name must be between 2 and 50 characters'),
    body('lastName')
        .trim()
        .notEmpty()
        .withMessage('Last name is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('Last name must be between 2 and 50 characters'),
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),
    body('phone')
        .matches(/^[6-9]\d{9}$/)
        .withMessage('Invalid Indian phone number (10 digits starting with 6-9)'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
        .withMessage('Password must contain at least one letter and one number'),
    body('avatarUrl')
        .optional()
        .isURL()
        .withMessage('Invalid avatar URL')
];

// Login validation
const loginValidation = [
    body('email')
        .isEmail()
        .withMessage('Valid email required')
        .normalizeEmail(),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

// Forgot password validation
const forgotPasswordValidation = [
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail()
];

// Reset password validation
const resetPasswordValidation = [
    body('token')
        .notEmpty()
        .withMessage('Reset token is required'),
    body('newPassword')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
        .withMessage('Password must contain at least one letter and one number')
];

// Change password validation
const changePasswordValidation = [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 8 })
        .withMessage('New password must be at least 8 characters')
        .matches(/^(?=.*[A-Za-z])(?=.*\d)/)
        .withMessage('Password must contain at least one letter and one number')
];

// ============ Public Routes (No Authentication Required) ============

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', validate(registerValidation), authController.register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', validate(loginValidation), authController.login);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Send password reset link to email
 * @access  Public
 */
router.post('/forgot-password', validate(forgotPasswordValidation), authController.forgotPassword);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset-password', validate(resetPasswordValidation), authController.resetPassword);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Refresh access token using refresh token from cookie
 * @access  Public (uses cookie)
 */
router.post('/refresh-token', authController.refreshAccessToken);

// ============ Protected Routes (Authentication Required) ============

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current logged in user profile
 * @access  Private
 */
router.get('/me', protect, authController.getMe);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user and clear cookies
 * @access  Private
 */
router.post('/logout', protect, authController.logout);

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change password when logged in
 * @access  Private
 */
router.post('/change-password', protect, validate(changePasswordValidation), authController.changePassword);

module.exports = router;