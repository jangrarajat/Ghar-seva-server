const User = require('../models/User');
const generateTokens = require('../utils/generateToken');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

// Cookie options
const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
};

// @desc    Register user directly
// @route   POST /api/v1/auth/register
exports.register = asyncHandler(async (req, res) => {
    const { firstName, lastName, email, phone, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
        throw new ApiError(400, 'User already exists with this email or phone');
    }

    // Create user
    const user = await User.create({
        firstName,
        lastName,
        email,
        phone,
        password,
        isEmailVerified: true, // email considered verified (no OTP)
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

// @desc    Login with email and password
// @route   POST /api/v1/auth/login
exports.login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Find user and include password field
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
        throw new ApiError(401, 'Invalid email or password');
    }

    if (user.status !== 'active') {
        throw new ApiError(401, 'Your account has been deactivated. Please contact support.');
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
        throw new ApiError(401, 'Invalid email or password');
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
        maxAge: 5 * 1000
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