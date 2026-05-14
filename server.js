// ✅ DOTENV MUST BE FIRST - Environment variables load karo
require('dotenv').config({ override: true });

// Debug - Check if keys are loaded
console.log('=== 🔧 ENVIRONMENT CHECK ===');
console.log('RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? '✅ Loaded' : '❌ Missing');
console.log('RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? '✅ Loaded' : '❌ Missing');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('PORT:', process.env.PORT || 5000);
console.log('============================\n');

const app = require('./src/app');
const connectDB = require('./src/config/database');
// const redisClient = require('./src/config/redis'); // ✅ COMMENT KARO

// Handle Uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error(`UNCAUGHT EXCEPTION! 💥 Shutting down...`);
    console.error(err.name, err.message);
    process.exit(1);
});

// Connect to Database & Redis
const startServer = async () => {
    try {
        await connectDB();
        console.log('📦 MongoDB Connected Successfully');

        // ✅ REDIS KO COMMENT KARO
        // await redisClient.connect();
        // console.log('🔴 Redis Connected Successfully');

        const PORT = process.env.PORT || 5000;
        const server = app.listen(PORT, () => {
            console.log(`\n🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
            console.log(`📍 API URL: http://localhost:${PORT}/api/v1`);
            console.log(`💚 Health Check: http://localhost:${PORT}/api/health\n`);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (err) => {
            console.error(`UNHANDLED REJECTION! 💥 Shutting down...`);
            console.error(err.name, err.message);
            server.close(() => {
                process.exit(1);
            });
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
            server.close(() => {
                console.log('💥 Process terminated!');
            });
        });

    } catch (error) {
        console.error('Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();