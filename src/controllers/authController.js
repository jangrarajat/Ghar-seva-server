const User = require('../models/User');
const OTP = require('../models/OTP');
const otpManager = require('../config/otpManager');
const generateTokens = require('../utils/generateToken');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { sendEmail, emailTemplates } = require('../utils/sendEmail');

// Cookie options
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
};

// @desc    Register user - Step 1: Send OTP
// @route   POST /api/v1/auth/register/send-otp
exports.registerSendOTP = asyncHandler(async (req, res) => {
    const { firstName, lastName, email, phone, password } = req.body;

    console.log('Register request received for:', email);

    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
        if (existingUser.isEmailVerified) {
            throw new ApiError(400, 'User already exists with this email or phone');
        }
        // If user exists but not verified, delete and allow re-registration
        await User.findByIdAndDelete(existingUser._id);
    }

    // Check remaining OTP quota
    const remainingOTP = await otpManager.getRemainingOTPCount(email);
    if (remainingOTP <= 0) {
        throw new ApiError(429, `You have exceeded the maximum OTP requests (5) for today. Please try again tomorrow.`);
    }

    // Generate OTP
    const otp = otpManager.generateOTP();
    console.log(`Generated OTP for ${email}: ${otp}`);

    // Store OTP in MongoDB
    try {
        await otpManager.storeOTP(email, otp, 'registration');
        console.log('OTP stored successfully');
    } catch (error) {
        console.error('Error storing OTP:', error);
        throw new ApiError(500, 'Failed to store OTP. Please try again.');
    }

    // Send OTP via email
    try {
        await sendEmail({
            email,
            subject: 'Complete Your Registration - Ghar Seva',
            html: emailTemplates.registrationOTP(otp, firstName)
        });

        new ApiResponse(200, {
            email,
            remainingOTP: remainingOTP - 1,
            message: 'OTP sent successfully to your email'
        }, 'OTP sent successfully').send(res);
    } catch (error) {
        console.error('Email sending failed:', error);
        // Don't throw, just log - OTP is stored in DB
        new ApiResponse(200, {
            email,
            remainingOTP: remainingOTP - 1,
            message: 'OTP generated but email sending failed. Check console for OTP.'
        }, 'OTP generated').send(res);
    }
});

// @desc    Register user - Step 2: Verify OTP & Create Account
// @route   POST /api/v1/auth/register/verify-otp
exports.registerVerifyOTP = asyncHandler(async (req, res) => {
    const { firstName, lastName, email, phone, password, otp } = req.body;

    // Verify OTP
    await otpManager.verifyOTP(email, otp, 'registration');

    // Create user
    const user = await User.create({
        firstName,
        lastName,
        email,
        phone,
        password,
        isEmailVerified: true,
        status: 'active'
    });

    // Generate tokens
    const tokens = generateTokens(user._id);

    // Set cookies
    res.cookie('accessToken', tokens.accessToken, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000 // 15 minutes
    });
    res.cookie('refreshToken', tokens.refreshToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    new ApiResponse(201, {
        user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            role: user.role
        },
        accessToken: tokens.accessToken
    }, 'Registration successful').send(res);
});

// @desc    Login - Step 1: Send OTP
// @route   POST /api/v1/auth/login/send-otp
exports.loginSendOTP = asyncHandler(async (req, res) => {
    const { email } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
        throw new ApiError(401, 'No account found with this email');
    }

    if (user.status !== 'active') {
        throw new ApiError(401, 'Your account has been deactivated. Please contact support.');
    }

    // Check remaining OTP quota
    const remainingOTP = await otpManager.getRemainingOTPCount(email);
    if (remainingOTP <= 0) {
        throw new ApiError(429, `You have exceeded the maximum OTP requests (5) for today. Please try again tomorrow.`);
    }

    // Generate OTP
    const otp = otpManager.generateOTP();
    console.log(`Generated OTP for ${email}: ${otp}`);

    // Store OTP
    await otpManager.storeOTP(email, otp, 'login');

    // Send OTP
    try {
        await sendEmail({
            email,
            subject: 'Login OTP - Ghar Seva',
            html: emailTemplates.loginOTP(otp, user.firstName)
        });

        new ApiResponse(200, {
            email,
            remainingOTP: remainingOTP - 1,
            message: 'OTP sent to your email'
        }, 'OTP sent successfully').send(res);
    } catch (error) {
        console.error('Email sending failed:', error);
        new ApiResponse(200, {
            email,
            remainingOTP: remainingOTP - 1,
            message: 'OTP generated. Check console for OTP.'
        }, 'OTP generated').send(res);
    }
});

// @desc    Login - Step 2: Verify OTP
// @route   POST /api/v1/auth/login/verify-otp
exports.loginVerifyOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    // Verify OTP
    await otpManager.verifyOTP(email, otp, 'login');

    // Get user
    const user = await User.findOne({ email });
    if (!user) {
        throw new ApiError(401, 'User not found');
    }

    // Generate tokens
    const tokens = generateTokens(user._id);

    // Set cookies
    res.cookie('accessToken', tokens.accessToken, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000
    });
    res.cookie('refreshToken', tokens.refreshToken, {
        ...cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    new ApiResponse(200, {
        user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            role: user.role
        },
        accessToken: tokens.accessToken
    }, 'Login successful').send(res);
});

// @desc    Get current user profile
// @route   GET /api/v1/auth/me
exports.getMe = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);

    new ApiResponse(200, { user }, 'User profile fetched').send(res);
});

// @desc    Logout user / clear cookies
// @route   POST /api/v1/auth/logout
exports.logout = asyncHandler(async (req, res) => {
    res.cookie('accessToken', 'none', {
        ...cookieOptions,
        maxAge: 5 * 1000 // 5 seconds
    });
    res.cookie('refreshToken', 'none', {
        ...cookieOptions,
        maxAge: 5 * 1000
    });

    new ApiResponse(200, null, 'Logged out successfully').send(res);
});

// @desc    Refresh access token
// @route   POST /api/v1/auth/refresh-token
exports.refreshAccessToken = asyncHandler(async (req, res) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
        throw new ApiError(401, 'No refresh token provided');
    }

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    const user = await User.findById(decoded.id);
    if (!user) {
        throw new ApiError(401, 'Invalid refresh token');
    }

    const tokens = generateTokens(user._id);

    res.cookie('accessToken', tokens.accessToken, {
        ...cookieOptions,
        maxAge: 15 * 60 * 1000
    });

    new ApiResponse(200, { message: 'Token refreshed' }, 'Token refreshed').send(res);
});