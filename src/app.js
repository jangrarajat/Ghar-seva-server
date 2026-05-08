const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');
const ApiError = require('./utils/ApiError');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const providerRoutes = require('./routes/providerRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const adminRoutes = require('./routes/adminRoutes');

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
        process.env.FRONTEND_URL
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// Temporary test route (DEV only)
app.get('/api/v1/test-email', async (req, res) => {
    console.log("process.env.EMAIL_USER", process.env.EMAIL_USER)
    console.log("process.env.EMAIL_PASS", process.env.EMAIL_PASS)
    const { sendEmail, emailTemplates } = require('./utils/sendEmail');
    // console.log(process.env.)
    try {
        await sendEmail({
            email: 'raorahul5631@gmail.com',
            subject: 'Test SMTP GharSeva',
            html: '<h1>Success!</h1><p>Your email config works.</p>'
        });
        res.json({ message: 'Email sent, check inbox' });
    } catch (err) {
        console.log(err)
        res.status(500).json({ error: err.message, message: "email error" });

    }
});

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
        timestamp: new Date().toISOString()
    });
});

// Mount Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/providers', providerRoutes);
app.use('/api/v1/services', serviceRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/admin', adminRoutes);

// 404 Handler
app.use((req, res, next) => {
    next(new ApiError(404, `Can't find ${req.originalUrl} on this server!`));
});

// Error Handler
app.use(errorHandler);

module.exports = app;