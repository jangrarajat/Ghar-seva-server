// controllers/adminController.js

const User = require('../models/User');
const Booking = require('../models/Booking');
const ServiceProvider = require('../models/ServiceProvider');
const Category = require('../models/Category');
const SubService = require('../models/SubService');
const Payment = require('../models/Payment');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const Settings = require('../models/Settings');
const Notification = require('../models/Notification');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

// ✅ Helper function to round to 2 decimal places
const roundTo2 = (num) => Math.round(num * 100) / 100;

// @desc    Get admin dashboard stats
// @route   GET /api/v1/admin/dashboard
exports.getDashboardStats = asyncHandler(async (req, res) => {
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Get counts
    const totalUsers = await User.countDocuments({ role: 'customer' });
    const totalProviders = await User.countDocuments({ role: 'provider' });
    const totalBookings = await Booking.countDocuments();
    const totalCategories = await Category.countDocuments();
    const totalServices = await SubService.countDocuments();

    // Today's stats
    const todayBookings = await Booking.countDocuments({
        createdAt: { $gte: startOfToday }
    });
    
    const todayRevenue = await Booking.aggregate([
        { $match: { createdAt: { $gte: startOfToday }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]);

    // Monthly stats
    const monthlyBookings = await Booking.countDocuments({
        createdAt: { $gte: startOfMonth }
    });
    
    const monthlyRevenue = await Booking.aggregate([
        { $match: { createdAt: { $gte: startOfMonth }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]);

    // Yearly stats
    const yearlyBookings = await Booking.countDocuments({
        createdAt: { $gte: startOfYear }
    });
    
    const yearlyRevenue = await Booking.aggregate([
        { $match: { createdAt: { $gte: startOfYear }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]);

    // Total revenue
    const totalRevenue = await Booking.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]);

    // Platform commission total
    const commissionTotal = await Payment.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$commission.amount' } } }
    ]);

    // Pending withdrawals
    const pendingWithdrawals = await WithdrawalRequest.aggregate([
        { $match: { status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Recent bookings
    const recentBookings = await Booking.find()
        .populate('customer', 'firstName lastName')
        .populate('provider', 'businessName')
        .sort('-createdAt')
        .limit(10);

    // ✅ Round all amounts to 2 decimal places
    const stats = {
        counts: {
            users: totalUsers,
            providers: totalProviders,
            bookings: totalBookings,
            categories: totalCategories,
            services: totalServices
        },
        today: {
            bookings: todayBookings,
            revenue: roundTo2(todayRevenue[0]?.total || 0)
        },
        monthly: {
            bookings: monthlyBookings,
            revenue: roundTo2(monthlyRevenue[0]?.total || 0)
        },
        yearly: {
            bookings: yearlyBookings,
            revenue: roundTo2(yearlyRevenue[0]?.total || 0)
        },
        totalRevenue: roundTo2(totalRevenue[0]?.total || 0),
        platformCommission: roundTo2(commissionTotal[0]?.total || 0),
        pendingWithdrawals: roundTo2(pendingWithdrawals[0]?.total || 0),
        recentBookings
    };

    new ApiResponse(200, stats, 'Dashboard stats fetched successfully').send(res);
});

// @desc    Get revenue report
// @route   GET /api/v1/admin/reports/revenue
exports.getRevenueReport = asyncHandler(async (req, res) => {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    let groupFormat;
    switch (groupBy) {
        case 'day':
            groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
            break;
        case 'month':
            groupFormat = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
            break;
        case 'year':
            groupFormat = { $dateToString: { format: '%Y', date: '$createdAt' } };
            break;
        default:
            groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    }

    const revenueData = await Booking.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, status: 'completed' } },
        {
            $group: {
                _id: groupFormat,
                revenue: { $sum: '$pricing.total' },
                bookings: { $sum: 1 },
                averageOrderValue: { $avg: '$pricing.total' }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    // ✅ Round to 2 decimal places
    const formattedData = revenueData.map(item => ({
        period: item._id,
        revenue: roundTo2(item.revenue),
        bookings: item.bookings,
        averageOrderValue: roundTo2(item.averageOrderValue || 0)
    }));

    // Calculate totals
    const totalRevenue = roundTo2(formattedData.reduce((sum, item) => sum + item.revenue, 0));
    const totalBookings = formattedData.reduce((sum, item) => sum + item.bookings, 0);
    const averageOrderValue = totalBookings > 0 ? roundTo2(totalRevenue / totalBookings) : 0;

    new ApiResponse(200, {
        data: formattedData,
        summary: {
            totalRevenue,
            totalBookings,
            averageOrderValue,
            period: { start: startDate, end: endDate }
        }
    }, 'Revenue report fetched successfully').send(res);
});

// @desc    Get provider earnings report
// @route   GET /api/v1/admin/reports/provider-earnings
exports.getProviderEarnings = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;

    const providerEarnings = await Payment.aggregate([
        { $match: { status: 'paid' } },
        {
            $group: {
                _id: '$provider',
                totalEarnings: { $sum: '$commission.providerEarning' },
                totalCommission: { $sum: '$commission.amount' },
                totalAmount: { $sum: '$amount' },
                transactionCount: { $sum: 1 }
            }
        },
        { $sort: { totalEarnings: -1 } },
        { $skip: (page - 1) * limit },
        { $limit: parseInt(limit) }
    ]);

    // Populate provider details
    const providerIds = providerEarnings.map(item => item._id);
    const providers = await ServiceProvider.find({ _id: { $in: providerIds } })
        .populate('user', 'firstName lastName email phone');

    // ✅ Round to 2 decimal places
    const formattedEarnings = providerEarnings.map(item => {
        const provider = providers.find(p => p._id.toString() === item._id.toString());
        return {
            provider: provider || { _id: item._id },
            totalEarnings: roundTo2(item.totalEarnings),
            totalCommission: roundTo2(item.totalCommission),
            totalAmount: roundTo2(item.totalAmount),
            transactionCount: item.transactionCount
        };
    });

    const total = await Payment.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, count: { $sum: 1 } } }
    ]);

    new ApiResponse(200, {
        earnings: formattedEarnings,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: total[0]?.count || 0,
            pages: Math.ceil((total[0]?.count || 0) / limit)
        }
    }, 'Provider earnings fetched successfully').send(res);
});

// @desc    Get all users
// @route   GET /api/v1/admin/users
exports.getAllUsers = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, role, status } = req.query;
    const query = {};
    
    if (role) query.role = role;
    if (status) query.status = status;

    const users = await User.find(query)
        .select('-password')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    new ApiResponse(200, {
        users,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    }, 'Users fetched successfully').send(res);
});

// @desc    Get user details
// @route   GET /api/v1/admin/users/:id
exports.getUserDetails = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)
        .select('-password')
        .populate('addresses');
    
    if (!user) throw new ApiError(404, 'User not found');

    new ApiResponse(200, { user }, 'User details fetched successfully').send(res);
});

// @desc    Update user status
// @route   PATCH /api/v1/admin/users/:id/status
exports.updateUserStatus = asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    
    if (!status) {
        throw new ApiError(400, 'Status is required');
    }
    
    if (!['active', 'inactive', 'suspended'].includes(status)) {
        throw new ApiError(400, 'Invalid status. Allowed: active, inactive, suspended');
    }
    
    const user = await User.findByIdAndUpdate(
        req.params.id,
        { status, updatedAt: new Date() },
        { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) throw new ApiError(404, 'User not found');

    // Create notification for user
    const notificationTitle = status === 'active' ? 'Account Activated' : 'Account Suspended';
    const notificationMessage = status === 'active' 
        ? 'Your account has been activated. You can now access all features.'
        : 'Your account has been suspended. Please contact support for more information.';

    await Notification.create({
        recipient: user._id,
        type: 'system',
        title: notificationTitle,
        message: notificationMessage,
        channels: { inApp: true, email: true }
    });

    new ApiResponse(200, { user }, 'User status updated successfully').send(res);
});

// @desc    Get all providers (for admin)
// @route   GET /api/v1/admin/providers
exports.getAllProviders = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, verificationStatus, isAvailable } = req.query;
    const query = {};
    
    if (verificationStatus) query.verificationStatus = verificationStatus;
    if (isAvailable !== undefined) query.isAvailable = isAvailable === 'true';

    const providers = await ServiceProvider.find(query)
        .populate('user', 'firstName lastName email phone status')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await ServiceProvider.countDocuments(query);

    new ApiResponse(200, {
        providers,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    }, 'Providers fetched successfully').send(res);
});

// @desc    Get all verification requests (ALL providers - pending, verified, rejected, suspended)
// @route   GET /api/v1/admin/verifications
exports.getVerificationRequests = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status, accountStatus } = req.query;
    
    const query = {};
    
    // Filter by KYC verification status (pending, under_review, verified, rejected)
    if (status && status !== 'all') {
        query.verificationStatus = status;
    }
    // If no status filter, get ALL providers (no restriction)
    
    const providers = await ServiceProvider.find(query)
        .populate('user', 'firstName lastName email phone avatar status')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    
    // Filter by account status if provided
    let filteredProviders = providers;
    if (accountStatus && accountStatus !== 'all') {
        filteredProviders = providers.filter(provider => provider.user?.status === accountStatus);
    }
    
    const verifications = filteredProviders.map(provider => ({
        _id: provider._id,
        businessName: provider.businessName,
        user: provider.user,
        documents: provider.documents || [],
        verificationStatus: provider.verificationStatus,
        verificationNote: provider.verificationNote,
        createdAt: provider.createdAt,
        experience: provider.experience,
        serviceArea: provider.serviceArea,
        bankDetails: provider.bankDetails
    }));
    
    new ApiResponse(200, {
        verifications,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: verifications.length,
            pages: Math.ceil(verifications.length / limit)
        }
    }, 'Verification requests fetched successfully').send(res);
});

// @desc    Verify or reject provider KYC - WITH PROPER DOCUMENT VALIDATION
// @route   PATCH /api/v1/admin/verifications/:id
exports.verifyProviderKYC = asyncHandler(async (req, res) => {
    const { status, note } = req.body || {};
    
    if (!status) {
        throw new ApiError(400, 'Status is required');
    }
    
    if (!['verified', 'rejected', 'under_review'].includes(status)) {
        throw new ApiError(400, 'Invalid status. Allowed: verified, rejected, under_review');
    }
    
    const provider = await ServiceProvider.findById(req.params.id);
    if (!provider) {
        throw new ApiError(404, 'Provider not found');
    }
    
    // ✅ Check if provider has uploaded at least one document
    const hasAadhaar = provider.documents.some(doc => doc.type === 'aadhar');
    const hasPAN = provider.documents.some(doc => doc.type === 'pan');
    
    // Determine which documents are uploaded
    const uploadedDocs = [];
    if (hasAadhaar) uploadedDocs.push('Aadhaar Card');
    if (hasPAN) uploadedDocs.push('PAN Card');
    
    let notificationTitle = '';
    let notificationMessage = '';
    
    if (status === 'verified') {
        // ✅ If trying to verify, check if at least one document is uploaded
        if (!hasAadhaar && !hasPAN) {
            throw new ApiError(400, 'Cannot verify: Provider has not uploaded any documents');
        }
        
        // If only Aadhaar is uploaded (no PAN)
        if (hasAadhaar && !hasPAN) {
            notificationTitle = 'KYC Partially Verified';
            notificationMessage = `Your Aadhaar card has been verified. However, PAN card is pending. Please upload PAN card for full verification. You can now start accepting bookings with limited access.`;
            provider.verificationStatus = 'verified';
            provider.verificationNote = 'Partially verified - Aadhaar verified, PAN pending';
        }
        // If both documents are uploaded
        else if (hasAadhaar && hasPAN) {
            notificationTitle = 'KYC Fully Verified';
            notificationMessage = `Your documents (${uploadedDocs.join(' and ')}) have been verified. You can now start accepting bookings.`;
            provider.verificationStatus = 'verified';
            provider.verificationNote = 'Fully verified - All documents verified';
        }
        // If only PAN is uploaded (no Aadhaar)
        else if (!hasAadhaar && hasPAN) {
            notificationTitle = 'KYC Partially Verified';
            notificationMessage = `Your PAN card has been verified. However, Aadhaar card is pending. Please upload Aadhaar card for full verification. You can now start accepting bookings with limited access.`;
            provider.verificationStatus = 'verified';
            provider.verificationNote = 'Partially verified - PAN verified, Aadhaar pending';
        }
        
        provider.verifiedAt = new Date();
        
        // Mark only uploaded documents as verified
        provider.documents.forEach(doc => {
            if (doc.type === 'aadhar' || doc.type === 'pan') {
                doc.isVerified = true;
                doc.verifiedAt = new Date();
                doc.verifiedBy = req.user._id;
            }
        });
        
        await User.findByIdAndUpdate(provider.user, { role: 'provider' });
        
    } else if (status === 'rejected') {
        provider.verificationStatus = 'rejected';
        provider.verificationNote = note || 'Your documents were rejected. Please upload clear copies.';
        provider.verifiedAt = null;
        
        notificationTitle = 'KYC Verification Rejected';
        notificationMessage = `Your KYC verification has been rejected. Reason: ${note || 'Please upload clear and valid documents.'}`;
        
    } else if (status === 'under_review') {
        provider.verificationStatus = 'under_review';
        provider.verificationNote = note || 'Your documents are under review';
        
        notificationTitle = 'KYC Documents Under Review';
        notificationMessage = `Your uploaded documents (${uploadedDocs.join(', ') || 'None'}) are under review by admin. We will notify you once verified.`;
    }
    
    await provider.save();
    
    // Create notification for provider
    await Notification.create({
        recipient: provider.user,
        type: status === 'verified' ? 'profile_verified' : status === 'rejected' ? 'profile_rejected' : 'system',
        title: notificationTitle,
        message: notificationMessage,
        reference: { model: 'ServiceProvider', id: provider._id },
        channels: { inApp: true, email: true }
    });
    
    new ApiResponse(200, { 
        provider: {
            _id: provider._id,
            verificationStatus: provider.verificationStatus,
            verificationNote: provider.verificationNote,
            documents: provider.documents
        }
    }, `Provider ${status} successfully`).send(res);
});

// @desc    Get provider documents for KYC verification
// @route   GET /api/v1/admin/providers/:id/documents
exports.getProviderDocuments = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findById(req.params.id)
        .populate('user', 'firstName lastName email phone');
    
    if (!provider) {
        throw new ApiError(404, 'Provider not found');
    }
    
    const documents = {
        aadhar: provider.documents?.find(doc => doc.type === 'aadhar') || null,
        pan: provider.documents?.find(doc => doc.type === 'pan') || null,
        driving_license: provider.documents?.find(doc => doc.type === 'driving_license') || null,
        certificate: provider.documents?.find(doc => doc.type === 'certificate') || null,
        other: provider.documents?.filter(doc => doc.type === 'other') || []
    };
    
    new ApiResponse(200, {
        providerId: provider._id,
        businessName: provider.businessName,
        user: provider.user,
        documents,
        verificationStatus: provider.verificationStatus,
        verificationNote: provider.verificationNote,
        createdAt: provider.createdAt
    }, 'Provider documents fetched').send(res);
});

// @desc    Get all categories (for admin)
// @route   GET /api/v1/admin/categories
exports.getAllCategories = asyncHandler(async (req, res) => {
    const categories = await Category.find()
        .populate('parent')
        .sort('sortOrder');
    
    new ApiResponse(200, { categories }, 'Categories fetched successfully').send(res);
});

// @desc    Create category
// @route   POST /api/v1/admin/categories
exports.createCategory = asyncHandler(async (req, res) => {
    const category = await Category.create(req.body);
    new ApiResponse(201, { category }, 'Category created successfully').send(res);
});

// @desc    Update category
// @route   PUT /api/v1/admin/categories/:id
exports.updateCategory = asyncHandler(async (req, res) => {
    const category = await Category.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
    );
    if (!category) throw new ApiError(404, 'Category not found');
    
    new ApiResponse(200, { category }, 'Category updated successfully').send(res);
});

// @desc    Delete category
// @route   DELETE /api/v1/admin/categories/:id
exports.deleteCategory = asyncHandler(async (req, res) => {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) throw new ApiError(404, 'Category not found');
    
    new ApiResponse(200, null, 'Category deleted successfully').send(res);
});

// @desc    Get all services (for admin)
// @route   GET /api/v1/admin/services
exports.getAllServices = asyncHandler(async (req, res) => {
    const services = await SubService.find()
        .populate('category', 'name slug')
        .sort('sortOrder');
    
    new ApiResponse(200, { services }, 'Services fetched successfully').send(res);
});

// @desc    Create service
// @route   POST /api/v1/admin/services
exports.createService = asyncHandler(async (req, res) => {
    const service = await SubService.create(req.body);
    new ApiResponse(201, { service }, 'Service created successfully').send(res);
});

// @desc    Update service
// @route   PUT /api/v1/admin/services/:id
exports.updateService = asyncHandler(async (req, res) => {
    const service = await SubService.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
    );
    if (!service) throw new ApiError(404, 'Service not found');
    
    new ApiResponse(200, { service }, 'Service updated successfully').send(res);
});

// @desc    Delete service
// @route   DELETE /api/v1/admin/services/:id
exports.deleteService = asyncHandler(async (req, res) => {
    const service = await SubService.findByIdAndDelete(req.params.id);
    if (!service) throw new ApiError(404, 'Service not found');
    
    new ApiResponse(200, null, 'Service deleted successfully').send(res);
});

// @desc    Get all bookings (for admin)
// @route   GET /api/v1/admin/bookings
exports.getAllBookings = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    const query = {};
    
    if (status) query.status = status;

    const bookings = await Booking.find(query)
        .populate('customer', 'firstName lastName email phone')
        .populate('provider', 'businessName user')
        .populate('category', 'name')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    new ApiResponse(200, {
        bookings,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    }, 'Bookings fetched successfully').send(res);
});

// @desc    Get commission settings
// @route   GET /api/v1/admin/settings/commission
exports.getCommissionSettings = asyncHandler(async (req, res) => {
    let setting = await Settings.findOne({ key: 'commission' });
    if (!setting) {
        setting = { key: 'commission', value: 20 };
    }
    new ApiResponse(200, { commission: setting.value }, 'Commission settings fetched').send(res);
});

// @desc    Update commission settings
// @route   PUT /api/v1/admin/settings/commission
exports.updateCommissionSettings = asyncHandler(async (req, res) => {
    const { commissionPercentage } = req.body;
    
    if (commissionPercentage < 0 || commissionPercentage > 100) {
        throw new ApiError(400, 'Commission percentage must be between 0 and 100');
    }
    
    const setting = await Settings.findOneAndUpdate(
        { key: 'commission' },
        { key: 'commission', value: commissionPercentage },
        { upsert: true, new: true }
    );
    
    new ApiResponse(200, { commission: setting.value }, 'Commission settings updated').send(res);
});

// @desc    Get all withdrawal requests (for admin)
// @route   GET /api/v1/admin/withdrawals
exports.getAllWithdrawals = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const query = {};
    
    if (status) query.status = status;

    const withdrawals = await WithdrawalRequest.find(query)
        .populate('provider', 'firstName lastName email phone')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await WithdrawalRequest.countDocuments(query);

    new ApiResponse(200, {
        withdrawals,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    }, 'Withdrawals fetched successfully').send(res);
});

// @desc    Approve withdrawal request
// @route   PATCH /api/v1/admin/withdrawals/:id/approve
exports.approveWithdrawal = asyncHandler(async (req, res) => {
    const { transactionId, adminNote } = req.body || {};
    
    if (!transactionId) {
        throw new ApiError(400, 'Transaction ID is required');
    }
    
    const withdrawal = await WithdrawalRequest.findById(req.params.id);
    if (!withdrawal) throw new ApiError(404, 'Withdrawal request not found');
    
    if (withdrawal.status !== 'pending') {
        throw new ApiError(400, 'Withdrawal request already processed');
    }
    
    withdrawal.status = 'approved';
    withdrawal.processedAt = new Date();
    withdrawal.transactionId = transactionId;
    withdrawal.adminNote = adminNote;
    await withdrawal.save();
    
    // Deduct from wallet
    const wallet = await Wallet.findOne({ user: withdrawal.provider });
    if (wallet) {
        wallet.balance = roundTo2(wallet.balance - withdrawal.amount);
        wallet.totalWithdrawals = roundTo2(wallet.totalWithdrawals + withdrawal.amount);
        wallet.transactions.push({
            type: 'debit',
            amount: withdrawal.amount,
            description: `Withdrawal request approved - ${withdrawal._id}`,
            balance: wallet.balance,
            status: 'completed'
        });
        await wallet.save();
    }
    
    new ApiResponse(200, { withdrawal }, 'Withdrawal approved successfully').send(res);
});

// @desc    Reject withdrawal request
// @route   PATCH /api/v1/admin/withdrawals/:id/reject
exports.rejectWithdrawal = asyncHandler(async (req, res) => {
    const { adminNote } = req.body || {};
    
    const withdrawal = await WithdrawalRequest.findById(req.params.id);
    if (!withdrawal) throw new ApiError(404, 'Withdrawal request not found');
    
    if (withdrawal.status !== 'pending') {
        throw new ApiError(400, 'Withdrawal request already processed');
    }
    
    withdrawal.status = 'rejected';
    withdrawal.processedAt = new Date();
    withdrawal.adminNote = adminNote;
    await withdrawal.save();
    
    new ApiResponse(200, { withdrawal }, 'Withdrawal rejected successfully').send(res);
});