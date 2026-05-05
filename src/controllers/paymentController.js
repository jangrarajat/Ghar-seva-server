const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const Wallet = require('../models/Wallet');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const Razorpay = require('razorpay');

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// @desc    Create payment order
// @route   POST /api/v1/payments/create-order
exports.createOrder = asyncHandler(async (req, res) => {
    const { bookingId } = req.body;
    
    const booking = await Booking.findById(bookingId);
    if (!booking) {
        throw new ApiError(404, 'Booking not found');
    }
    
    if (booking.payment.status === 'paid') {
        throw new ApiError(400, 'Payment already completed');
    }
    
    const amount = Math.round(booking.pricing.total * 100); // Convert to paise
    
    const options = {
        amount,
        currency: 'INR',
        receipt: `rcpt_${booking.bookingId}`,
        notes: {
            bookingId: booking._id.toString(),
            customerId: req.user._id.toString()
        }
    };
    
    const order = await razorpay.orders.create(options);
    
    // Save payment record
    await Payment.create({
        booking: booking._id,
        customer: req.user._id,
        provider: booking.provider,
        amount: booking.pricing.total,
        razorpayOrderId: order.id,
        receipt: order.receipt,
        commission: {
            percentage: 20,
            amount: booking.pricing.total * 0.2,
            providerEarning: booking.pricing.total * 0.8
        }
    });
    
    new ApiResponse(200, {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        bookingId: booking._id
    }, 'Order created').send(res);
});

// @desc    Verify payment
// @route   POST /api/v1/payments/verify
exports.verifyPayment = asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    // Verify signature
    const crypto = require('crypto');
    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(sign.toString())
        .digest('hex');
    
    if (expectedSign !== razorpay_signature) {
        throw new ApiError(400, 'Invalid payment signature');
    }
    
    // Update payment
    const payment = await Payment.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        {
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
            status: 'paid',
            method: 'upi'
        },
        { new: true }
    );
    
    if (!payment) {
        throw new ApiError(404, 'Payment record not found');
    }
    
    // Update booking payment status
    await Booking.findByIdAndUpdate(payment.booking, {
        'payment.status': 'paid',
        'payment.transactionId': razorpay_payment_id,
        'payment.paidAt': new Date(),
        'payment.paidAmount': payment.amount
    });
    
    // Credit provider wallet (after commission)
    let wallet = await Wallet.findOne({ user: payment.provider });
    if (!wallet) {
        wallet = await Wallet.create({ user: payment.provider });
    }
    
    const providerEarning = payment.commission.providerEarning;
    wallet.balance += providerEarning;
    wallet.totalEarnings += providerEarning;
    wallet.transactions.push({
        type: 'credit',
        amount: providerEarning,
        description: `Payment for booking ${payment.booking}`,
        balance: wallet.balance
    });
    await wallet.save();
    
    new ApiResponse(200, { payment }, 'Payment verified successfully').send(res);
});

// @desc    Payment webhook
// @route   POST /api/v1/payments/webhook
exports.webhook = asyncHandler(async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    // Verify webhook signature
    const crypto = require('crypto');
    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest('hex');
    
    if (digest !== req.headers['x-razorpay-signature']) {
        throw new ApiError(400, 'Invalid webhook signature');
    }
    
    const event = req.body.event;
    
    if (event === 'payment.captured') {
        const paymentData = req.body.payload.payment.entity;
        
        await Payment.findOneAndUpdate(
            { razorpayOrderId: paymentData.order_id },
            {
                razorpayPaymentId: paymentData.id,
                status: 'paid'
            }
        );
    }
    
    res.status(200).json({ status: 'ok' });
});

// @desc    Get payment history
// @route   GET /api/v1/payments/history
exports.getPaymentHistory = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    
    const query = {};
    if (req.user.role === 'customer') {
        query.customer = req.user._id;
    } else if (req.user.role === 'provider') {
        const provider = await ServiceProvider.findOne({ user: req.user._id });
        if (provider) {
            query.provider = provider._id;
        }
    }
    
    const payments = await Payment.find(query)
        .populate('booking', 'bookingId scheduledDate')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    
    const total = await Payment.countDocuments(query);
    
    new ApiResponse(200, {
        payments,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    }, 'Payment history fetched').send(res);
});

// @desc    Withdraw from wallet (Provider)
// @route   POST /api/v1/payments/withdraw
exports.withdrawFromWallet = asyncHandler(async (req, res) => {
    const { amount } = req.body;
    
    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) {
        throw new ApiError(404, 'Wallet not found');
    }
    
    if (wallet.balance < amount) {
        throw new ApiError(400, 'Insufficient balance');
    }
    
    if (amount < 100) {
        throw new ApiError(400, 'Minimum withdrawal amount is ₹100');
    }
    
    wallet.balance -= amount;
    wallet.totalWithdrawals += amount;
    wallet.transactions.push({
        type: 'debit',
        amount,
        description: 'Withdrawal to bank account',
        balance: wallet.balance,
        status: 'pending'
    });
    
    await wallet.save();
    
    new ApiResponse(200, { wallet }, 'Withdrawal request submitted').send(res);
});