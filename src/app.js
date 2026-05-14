const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');
const ApiError = require('./utils/ApiError');

// ✅ Ensure dotenv is loaded (already loaded in server.js, but safe to have)
require('dotenv').config({ override: true });

// Import Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const providerRoutes = require('./routes/providerRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const adminRoutes = require('./routes/adminRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const paymentController = require('./controllers/paymentController');

const app = express();
app.set('trust proxy', 1);

// Security Middleware
app.use(helmet());
app.use(cors({
    origin: [
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'http://localhost:5173',
        'http://localhost:5175',
        'http://127.0.0.1:3000',
        'https://ghar-seva-client.vercel.app',
        process.env.FRONTEND_URL
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// Rate Limiting - Disabled in development, high limit in production
const isDevelopment = process.env.NODE_ENV === 'development';
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: isDevelopment ? 1000 : 100, // 1000 requests per minute in dev, 100 in production
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// IMPORTANT: Webhook must be BEFORE express.json() middleware
app.post('/api/v1/payments/webhook', express.raw({ type: 'application/json' }), paymentController.webhook);

// Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Request Logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Health Check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Ghar Seva API is running',
        timestamp: new Date().toISOString(),
        razorpayConfigured: !!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET
    });
});

// Debug route to check env variables (remove in production)
if (process.env.NODE_ENV === 'development') {
    app.get('/api/v1/debug/env', (req, res) => {
        res.json({
            razorpay_key_exists: !!process.env.RAZORPAY_KEY_ID,
            razorpay_secret_exists: !!process.env.RAZORPAY_KEY_SECRET,
            razorpay_key_prefix: process.env.RAZORPAY_KEY_ID ? process.env.RAZORPAY_KEY_ID.substring(0, 10) + '...' : null,
            node_env: process.env.NODE_ENV,
            mongodb_connected: true
        });
    });
}

// Mount Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/providers', providerRoutes);
app.use('/api/v1/services', serviceRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/payments', paymentRoutes);

// 404 Handler
app.use((req, res, next) => {
    next(new ApiError(404, `Can't find ${req.originalUrl} on this server!`));
});

// Error Handler
app.use(errorHandler);

module.exports = app;