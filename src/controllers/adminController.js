const User = require('../models/User');
const ServiceProvider = require('../models/ServiceProvider');
const Booking = require('../models/Booking');
const Category = require('../models/Category');
const SubService = require('../models/SubService');
const Review = require('../models/Review');
const Payment = require('../models/Payment');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get dashboard stats
// @route   GET /api/v1/admin/dashboard
exports.getDashboardStats = asyncHandler(async (req, res) => {
    const [
        totalUsers,
        totalProviders,
        totalBookings,
        totalRevenue,
        pendingVerifications,
        recentBookings
    ] = await Promise.all([
        User.countDocuments({ role: 'customer' }),
        ServiceProvider.countDocuments(),
        Booking.countDocuments(),
        Payment.aggregate([
            { $match: { status: 'paid' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        ServiceProvider.countDocuments({ verificationStatus: 'pending' }),
        Booking.find()
            .sort('-createdAt')
            .limit(5)
            .populate('customer', 'firstName lastName')
            .populate('provider', 'businessName')
            .select('bookingId status pricing.total createdAt')
    ]);
    
    new ApiResponse(200, {
        stats: {
            totalUsers,
            totalProviders,
            totalBookings,
            totalRevenue: totalRevenue[0]?.total || 0,
            pendingVerifications
        },
        recentBookings
    }, 'Dashboard stats fetched').send(res);
});

// @desc    Get all users
// @route   GET /api/v1/admin/users
exports.getUsers = asyncHandler(async (req, res) => {
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
        pagination: { page: parseInt(page), limit: parseInt(limit), total }
    }, 'Users fetched').send(res);
});

// @desc    Get user details
// @route   GET /api/v1/admin/users/:id
exports.getUserDetails = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
        throw new ApiError(404, 'User not found');
    }
    
    // Get user's bookings
    const bookings = await Booking.find({ customer: user._id })
        .sort('-createdAt')
        .limit(10);
    
    new ApiResponse(200, { user, bookings }, 'User details fetched').send(res);
});

// @desc    Update user status
// @route   PATCH /api/v1/admin/users/:id/status
exports.updateUserStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    
    const user = await User.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
    ).select('-password');
    
    if (!user) {
        throw new ApiError(404, 'User not found');
    }
    
    new ApiResponse(200, { user }, 'User status updated').send(res);
});

// @desc    Get pending verifications
// @route   GET /api/v1/admin/verifications
exports.getPendingVerifications = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    
    const providers = await ServiceProvider.find({
        verificationStatus: { $in: ['pending', 'under_review'] }
    })
        .populate('user', 'firstName lastName email phone')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    
    const total = await ServiceProvider.countDocuments({
        verificationStatus: { $in: ['pending', 'under_review'] }
    });
    
    new ApiResponse(200, {
        providers,
        pagination: { page: parseInt(page), limit: parseInt(limit), total }
    }, 'Pending verifications fetched').send(res);
});

// @desc    Verify provider
// @route   PATCH /api/v1/admin/verifications/:id
exports.verifyProvider = asyncHandler(async (req, res) => {
    const { status, note } = req.body;
    
    const provider = await ServiceProvider.findByIdAndUpdate(
        req.params.id,
        {
            verificationStatus: status,
            verificationNote: note,
            verifiedAt: status === 'verified' ? new Date() : null,
            'documents.$[].isVerified': status === 'verified'
        },
        { new: true }
    ).populate('user', 'firstName lastName email');
    
    if (!provider) {
        throw new ApiError(404, 'Provider not found');
    }
    
    // Update user role if verified
    if (status === 'verified') {
        await User.findByIdAndUpdate(provider.user._id, { role: 'provider', status: 'active' });
    }
    
    new ApiResponse(200, { provider }, `Provider ${status}`).send(res);
});

// @desc    Manage categories
// @route   POST /api/v1/admin/categories
exports.createCategory = asyncHandler(async (req, res) => {
    const category = await Category.create(req.body);
    new ApiResponse(201, { category }, 'Category created').send(res);
});

// @desc    Update category
// @route   PUT /api/v1/admin/categories/:id
exports.updateCategory = asyncHandler(async (req, res) => {
    const category = await Category.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
    );
    
    if (!category) {
        throw new ApiError(404, 'Category not found');
    }
    
    new ApiResponse(200, { category }, 'Category updated').send(res);
});

// @desc    Delete category
// @route   DELETE /api/v1/admin/categories/:id
exports.deleteCategory = asyncHandler(async (req, res) => {
    const category = await Category.findByIdAndDelete(req.params.id);
    
    if (!category) {
        throw new ApiError(404, 'Category not found');
    }
    
    new ApiResponse(200, null, 'Category deleted').send(res);
});

// @desc    Manage services
// @route   POST /api/v1/admin/services
exports.createService = asyncHandler(async (req, res) => {
    const service = await SubService.create(req.body);
    new ApiResponse(201, { service }, 'Service created').send(res);
});

// @desc    Update service
// @route   PUT /api/v1/admin/services/:id
exports.updateService = asyncHandler(async (req, res) => {
    const service = await SubService.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
    );
    
    if (!service) {
        throw new ApiError(404, 'Service not found');
    }
    
    new ApiResponse(200, { service }, 'Service updated').send(res);
});

// @desc    Delete service
// @route   DELETE /api/v1/admin/services/:id
exports.deleteService = asyncHandler(async (req, res) => {
    const service = await SubService.findByIdAndDelete(req.params.id);
    
    if (!service) {
        throw new ApiError(404, 'Service not found');
    }
    
    new ApiResponse(200, null, 'Service deleted').send(res);
});

// @desc    Get all bookings (Admin)
// @route   GET /api/v1/admin/bookings
exports.getAllBookings = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    
    const query = {};
    if (status) query.status = status;
    
    const bookings = await Booking.find(query)
        .populate('customer', 'firstName lastName email phone')
        .populate('provider', 'businessName')
        .populate('items.service', 'name')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    
    const total = await Booking.countDocuments(query);
    
    new ApiResponse(200, {
        bookings,
        pagination: { page: parseInt(page), limit: parseInt(limit), total }
    }, 'Bookings fetched').send(res);
});

// @desc    Get revenue reports
// @route   GET /api/v1/admin/reports/revenue
exports.getRevenueReport = asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    
    const match = {
        status: 'paid'
    };
    
    if (startDate && endDate) {
        match.createdAt = {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        };
    }
    
    const revenueData = await Payment.aggregate([
        { $match: match },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                totalRevenue: { $sum: '$amount' },
                commission: { $sum: '$commission.amount' },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);
    
    const summary = {
        totalRevenue: revenueData.reduce((acc, curr) => acc + curr.totalRevenue, 0),
        totalCommission: revenueData.reduce((acc, curr) => acc + curr.commission, 0),
        totalTransactions: revenueData.reduce((acc, curr) => acc + curr.count, 0)
    };
    
    new ApiResponse(200, { revenueData, summary }, 'Revenue report generated').send(res);
});

// @desc    Moderate reviews
// @route   PATCH /api/v1/admin/reviews/:id
exports.moderateReview = asyncHandler(async (req, res) => {
    const { status, note } = req.body;
    
    const review = await Review.findByIdAndUpdate(
        req.params.id,
        {
            status,
            moderationNote: note
        },
        { new: true }
    );
    
    if (!review) {
        throw new ApiError(404, 'Review not found');
    }
    
    new ApiResponse(200, { review }, 'Review moderated').send(res);
});