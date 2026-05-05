const rateLimit = require('express-rate-limit');

const otpRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // Sirf 1 minute ka gap
    max: 1000,               // 1 minute mein 1000 requests (unlimited jaisa hi hai)
    handler: (req, res) => {
        res.status(429).json({
            success: false,
            message: 'Testing limit reached. Wait a minute.'
        });
    },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false }
});

const authLimiter = rateLimit({
    // windowMs: 15 * 60 * 4000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false }
});

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false }
});

module.exports = { otpRateLimiter, authLimiter, apiLimiter };