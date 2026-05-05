const ServiceProvider = require('../models/ServiceProvider');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Register as service provider
// @route   POST /api/v1/providers/register
exports.registerProvider = asyncHandler(async (req, res) => {
    // Check if already registered
    const existingProvider = await ServiceProvider.findOne({ user: req.user._id });
    if (existingProvider) {
        throw new ApiError(400, 'You are already registered as a service provider');
    }
    
    const providerData = {
        user: req.user._id,
        ...req.body,
        verificationStatus: 'pending'
    };
    
    const provider = await ServiceProvider.create(providerData);
    
    // Update user role
    await User.findByIdAndUpdate(req.user._id, { role: 'provider' });
    
    new ApiResponse(201, { provider }, 'Provider registration submitted for verification').send(res);
});

// @desc    Get provider profile
// @route   GET /api/v1/providers/profile
exports.getProfile = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id })
        .populate('services.category', 'name slug')
        .populate('services.subServices', 'name slug basePrice');
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    new ApiResponse(200, { provider }, 'Profile fetched').send(res);
});

// @desc    Update provider profile
// @route   PUT /api/v1/providers/profile
exports.updateProfile = asyncHandler(async (req, res) => {
    const allowedFields = [
        'businessName', 'bio', 'experience', 'workingHours',
        'isAvailable', 'unavailableDates'
    ];
    
    const updateData = {};
    Object.keys(req.body).forEach(key => {
        if (allowedFields.includes(key)) {
            updateData[key] = req.body[key];
        }
    });
    
    const provider = await ServiceProvider.findOneAndUpdate(
        { user: req.user._id },
        updateData,
        { new: true, runValidators: true }
    );
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    new ApiResponse(200, { provider }, 'Profile updated').send(res);
});

// @desc    Add service to provider
// @route   POST /api/v1/providers/services
exports.addService = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    // Check if service already exists
    const existingService = provider.services.find(
        s => s.category.toString() === req.body.category
    );
    
    if (existingService) {
        throw new ApiError(400, 'Service already added for this category');
    }
    
    provider.services.push(req.body);
    await provider.save();
    
    new ApiResponse(201, { services: provider.services }, 'Service added').send(res);
});

// @desc    Update service
// @route   PUT /api/v1/providers/services/:serviceId
exports.updateService = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    const service = provider.services.id(req.params.serviceId);
    if (!service) {
        throw new ApiError(404, 'Service not found');
    }
    
    Object.assign(service, req.body);
    await provider.save();
    
    new ApiResponse(200, { services: provider.services }, 'Service updated').send(res);
});

// @desc    Remove service
// @route   DELETE /api/v1/providers/services/:serviceId
exports.removeService = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    provider.services.id(req.params.serviceId).deleteOne();
    await provider.save();
    
    new ApiResponse(200, null, 'Service removed').send(res);
});

// @desc    Update service area
// @route   PUT /api/v1/providers/service-area
exports.updateServiceArea = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOneAndUpdate(
        { user: req.user._id },
        { serviceArea: req.body },
        { new: true }
    );
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    new ApiResponse(200, { serviceArea: provider.serviceArea }, 'Service area updated').send(res);
});

// @desc    Upload documents
// @route   POST /api/v1/providers/documents
exports.uploadDocuments = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    const { type, documentNumber, url, publicId } = req.body;
    
    provider.documents.push({
        type,
        documentNumber,
        frontImage: { url, publicId }
    });
    
    provider.verificationStatus = 'under_review';
    await provider.save();
    
    new ApiResponse(201, { documents: provider.documents }, 'Documents uploaded').send(res);
});

// @desc    Update bank details
// @route   PUT /api/v1/providers/bank-details
exports.updateBankDetails = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOneAndUpdate(
        { user: req.user._id },
        { bankDetails: req.body },
        { new: true }
    );
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    new ApiResponse(200, { bankDetails: provider.bankDetails }, 'Bank details updated').send(res);
});

// @desc    Get provider stats
// @route   GET /api/v1/providers/stats
exports.getStats = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    
    if (!provider) {
        throw new ApiError(404, 'Provider profile not found');
    }
    
    // Get recent bookings
    const Booking = require('../models/Booking');
    const recentBookings = await Booking.find({ provider: provider._id })
        .sort('-createdAt')
        .limit(5)
        .select('bookingId status scheduledDate pricing.total');
    
    // Get earnings summary
    const earningsSummary = await Booking.aggregate([
        {
            $match: {
                provider: provider._id,
                status: 'completed'
            }
        },
        {
            $group: {
                _id: { $month: '$createdAt' },
                total: { $sum: '$pricing.total' },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id': -1 } },
        { $limit: 12 }
    ]);
    
    new ApiResponse(200, {
        stats: provider.stats,
        rating: provider.rating,
        recentBookings,
        earningsSummary
    }, 'Stats fetched').send(res);
});

// @desc    Get public provider profile
// @route   GET /api/v1/providers/:id/public
exports.getPublicProfile = asyncHandler(async (req, res) => {
    const provider = await ServiceProvider.findById(req.params.id)
        .populate('user', 'firstName lastName avatar')
        .populate('services.category', 'name slug')
        .populate('services.subServices', 'name slug basePrice');
    
    if (!provider) {
        throw new ApiError(404, 'Provider not found');
    }
    
    // Get reviews
    const Review = require('../models/Review');
    const reviews = await Review.find({
        provider: provider._id,
        status: 'approved'
    })
        .populate('customer', 'firstName lastName avatar')
        .sort('-createdAt')
        .limit(10);
    
    new ApiResponse(200, { provider, reviews }, 'Provider profile fetched').send(res);
});

// @desc    Search providers by location
// @route   GET /api/v1/providers/search
exports.searchProviders = asyncHandler(async (req, res) => {
    const { latitude, longitude, radius = 10, service, page = 1, limit = 10 } = req.query;
    
    const query = {
        verificationStatus: 'verified',
        isAvailable: true
    };
    
    if (service) {
        query['services.category'] = service;
    }
    
    if (latitude && longitude) {
        query.serviceArea = {
            $nearSphere: {
                $geometry: {
                    type: 'Point',
                    coordinates: [parseFloat(longitude), parseFloat(latitude)]
                },
                $maxDistance: parseFloat(radius) * 1000 // Convert km to meters
            }
        };
    }
    
    const providers = await ServiceProvider.find(query)
        .populate('user', 'firstName lastName avatar')
        .populate('services.category', 'name slug')
        .sort('-rating.average')
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
    }, 'Providers fetched').send(res);
});