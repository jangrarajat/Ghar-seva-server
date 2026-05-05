// src/config/email.js
const nodemailer = require('nodemailer');

let transporter = null;

// Create transporter only if email config is available
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: process.env.EMAIL_PORT || 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    // Verify transporter
    transporter.verify((error, success) => {
        if (error) {
            console.error('⚠️ Email configuration error:', error.message);
            console.log('📧 Emails will be logged to console only');
            transporter = null;
        } else {
            console.log('✅ Email service configured successfully');
        }
    });
} else {
    console.log('📧 Email credentials not found. Emails will be logged to console only');
}

module.exports = transporter;