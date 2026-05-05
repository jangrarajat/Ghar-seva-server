// src/utils/sendEmail.js
const transporter = require('../config/email');

const sendEmail = async ({ email, subject, html }) => {
    // Try to send real email if transporter is configured
    if (transporter) {
        try {
            const mailOptions = {
                from: `"${process.env.FROM_NAME || 'Ghar Seva'}" <${process.env.FROM_EMAIL || 'noreply@gharseva.com'}>`,
                to: email,
                subject,
                html
            };
            await transporter.sendMail(mailOptions);
            console.log(`✅ Email sent to ${email}`);
            return true;
        } catch (error) {
            console.warn('⚠️ Failed to send real email:', error.message);
        }
    }
    
    // Fallback: Log OTP to console
    console.log('\n📧 === EMAIL (Console Fallback) ===');
    console.log(`To: ${email}`);
    console.log(`Subject: ${subject}`);
    
    // Extract OTP from HTML if present
    const otpMatch = html.match(/<h1[^>]*>(\d{4,6})<\/h1>/);
    if (otpMatch) {
        console.log(`🔑 OTP: ${otpMatch[1]}`);
    }
    console.log('================================\n');
    
    return true;
};

// Email Templates
const emailTemplates = {
    registrationOTP: (otp, name) => `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify Your Email - GharSeva</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                .otp-box { background: white; padding: 25px; text-align: center; border-radius: 10px; margin: 20px 0; border: 2px dashed #3b82f6; }
                .otp-code { font-size: 48px; font-weight: bold; letter-spacing: 10px; color: #3b82f6; font-family: monospace; }
                .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #6b7280; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>GharSeva</h1>
                    <p>Your Trusted Home Service Partner</p>
                </div>
                <div class="content">
                    <h2>Welcome, ${name || 'Guest'}!</h2>
                    <p>Thank you for choosing GharSeva. Please use the following OTP to complete your registration:</p>
                    
                    <div class="otp-box">
                        <div class="otp-code">${otp}</div>
                        <p style="margin-top: 10px; color: #6b7280;">This OTP is valid for ${process.env.OTP_EXPIRE_MINUTES || 10} minutes</p>
                    </div>
                    
                    <p>If you didn't request this OTP, please ignore this email.</p>
                    
                    <hr style="margin: 20px 0;">
                    <p style="color: #6b7280; font-size: 14px;">Need help? Contact us at support@gharseva.com</p>
                </div>
                <div class="footer">
                    <p>&copy; 2024 GharSeva. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `,
    
    loginOTP: (otp, name) => `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Login OTP - GharSeva</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                .otp-box { background: white; padding: 25px; text-align: center; border-radius: 10px; margin: 20px 0; border: 2px dashed #3b82f6; }
                .otp-code { font-size: 48px; font-weight: bold; letter-spacing: 10px; color: #3b82f6; font-family: monospace; }
                .footer { text-align: center; padding: 20px; font-size: 12px; color: #6b7280; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>GharSeva</h1>
                    <p>Your Trusted Home Service Partner</p>
                </div>
                <div class="content">
                    <h2>Welcome back, ${name || 'User'}!</h2>
                    <p>Use the following OTP to login to your GharSeva account:</p>
                    
                    <div class="otp-box">
                        <div class="otp-code">${otp}</div>
                        <p style="margin-top: 10px; color: #6b7280;">This OTP is valid for ${process.env.OTP_EXPIRE_MINUTES || 10} minutes</p>
                    </div>
                    
                    <p>If you didn't request this login, please secure your account by contacting support.</p>
                    
                    <hr style="margin: 20px 0;">
                    <p style="color: #6b7280; font-size: 14px;">Need help? Contact us at support@gharseva.com</p>
                </div>
                <div class="footer">
                    <p>&copy; 2024 GharSeva. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `,
    
    bookingConfirmation: (booking) => `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Booking Confirmed - GharSeva</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 20px; text-align: center; }
                .content { background: #f9fafb; padding: 30px; }
                .booking-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Booking Confirmed!</h1>
                </div>
                <div class="content">
                    <h2>Hello ${booking.customer?.firstName || 'Customer'},</h2>
                    <p>Your booking has been confirmed successfully!</p>
                    
                    <div class="booking-details">
                        <h3>Booking Details:</h3>
                        <p><strong>Booking ID:</strong> ${booking.bookingId}</p>
                        <p><strong>Date:</strong> ${new Date(booking.scheduledDate).toLocaleDateString()}</p>
                        <p><strong>Time:</strong> ${booking.scheduledTime?.start}</p>
                        <p><strong>Total Amount:</strong> ₹${booking.pricing?.total}</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `
};

module.exports = { sendEmail, emailTemplates };