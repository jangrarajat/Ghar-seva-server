const WithdrawalRequest = require('../models/WithdrawalRequest');
const Wallet = require('../models/Wallet');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { sendEmail } = require('../utils/sendEmail');

// Provider requests withdrawal
exports.requestWithdrawal = asyncHandler(async (req, res) => {
    const { amount, accountDetails } = req.body;
    if (amount < 100) throw new ApiError(400, 'Minimum withdrawal amount is ₹100');
    
    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet || wallet.balance < amount) throw new ApiError(400, 'Insufficient wallet balance');
    
    const request = await WithdrawalRequest.create({
        provider: req.user._id,
        amount,
        accountDetails,
        status: 'pending'
    });
    
    // Create notification for admin
    await Notification.create({
        recipient: null, // will be fetched by admin role
        type: 'system',
        title: 'New Withdrawal Request',
        message: `Provider ${req.user.fullName} requested ₹${amount} withdrawal`,
        data: { withdrawalId: request._id },
        channels: { inApp: true, email: true }
    });
    
    new ApiResponse(201, { request }, 'Withdrawal request submitted').send(res);
});

// Admin gets all withdrawal requests
exports.getAllWithdrawalRequests = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    const requests = await WithdrawalRequest.find(query).populate('provider', 'firstName lastName email phone')
        .sort('-createdAt').skip((page-1)*limit).limit(parseInt(limit));
    const total = await WithdrawalRequest.countDocuments(query);
    new ApiResponse(200, { requests, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total/limit) } }, 'Requests fetched').send(res);
});

// Admin approves withdrawal
exports.approveWithdrawal = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { transactionId, adminNote } = req.body;
    const request = await WithdrawalRequest.findById(id).populate('provider');
    if (!request) throw new ApiError(404, 'Request not found');
    if (request.status !== 'pending') throw new ApiError(400, 'Request already processed');
    
    const wallet = await Wallet.findOne({ user: request.provider._id });
    if (!wallet || wallet.balance < request.amount) throw new ApiError(400, 'Insufficient balance');
    
    // Deduct from wallet
    wallet.balance -= request.amount;
    wallet.totalWithdrawals += request.amount;
    wallet.transactions.push({
        type: 'debit',
        amount: request.amount,
        description: `Withdrawal approved - ${transactionId || 'Manual transfer'}`,
        balance: wallet.balance,
        status: 'completed'
    });
    await wallet.save();
    
    request.status = 'approved';
    request.processedAt = new Date();
    request.transactionId = transactionId;
    request.adminNote = adminNote;
    await request.save();
    
    // Notify provider via email
    try {
        await sendEmail({
            email: request.provider.email,
            subject: 'Withdrawal Request Approved',
            html: `<h2>Your withdrawal of ₹${request.amount} has been approved!</h2><p>Amount will be transferred to your account shortly.</p>`
        });
    } catch (err) { console.error('Email error:', err); }
    
    new ApiResponse(200, { request }, 'Withdrawal approved').send(res);
});

// Admin rejects withdrawal
exports.rejectWithdrawal = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { adminNote } = req.body;
    const request = await WithdrawalRequest.findById(id).populate('provider');
    if (!request) throw new ApiError(404, 'Request not found');
    if (request.status !== 'pending') throw new ApiError(400, 'Request already processed');
    
    request.status = 'rejected';
    request.adminNote = adminNote;
    await request.save();
    
    // Notify provider
    try {
        await sendEmail({
            email: request.provider.email,
            subject: 'Withdrawal Request Rejected',
            html: `<h2>Your withdrawal request of ₹${request.amount} was rejected.</h2><p>Reason: ${adminNote || 'Please contact support.'}</p>`
        });
    } catch (err) { console.error('Email error:', err); }
    
    new ApiResponse(200, { request }, 'Withdrawal rejected').send(res);
});

// Provider gets their withdrawal history
exports.getMyWithdrawals = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const requests = await WithdrawalRequest.find({ provider: req.user._id }).sort('-createdAt')
        .skip((page-1)*limit).limit(parseInt(limit));
    const total = await WithdrawalRequest.countDocuments({ provider: req.user._id });
    new ApiResponse(200, { requests, pagination: { page, limit, total, pages: Math.ceil(total/limit) } }, 'Withdrawal history fetched').send(res);
});