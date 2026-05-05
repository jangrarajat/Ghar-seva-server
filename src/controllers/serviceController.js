const Category = require('../models/Category');
const SubService = require('../models/SubService');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get all categories
// @route   GET /api/v1/services/categories
exports.getCategories = asyncHandler(async (req, res) => {
    const categories = await Category.find({ 
        isActive: true,
        parent: null 
    })
    .populate('subCategories')
    .sort('sortOrder');
    
    new ApiResponse(200, { categories }, 'Categories fetched').send(res);
});

// @desc    Get single category with subcategories
// @route   GET /api/v1/services/categories/:slug
exports.getCategoryBySlug = asyncHandler(async (req, res) => {
    const category = await Category.findOne({ 
        slug: req.params.slug,
        isActive: true 
    }).populate('subCategories');
    
    if (!category) {
        throw new ApiError(404, 'Category not found');
    }
    
    // Get services under this category
    const services = await SubService.find({
        category: category._id,
        isActive: true
    }).sort('sortOrder');
    
    new ApiResponse(200, { category, services }, 'Category fetched').send(res);
});

// @desc    Get all services
// @route   GET /api/v1/services
exports.getServices = asyncHandler(async (req, res) => {
    const { category, search, page = 1, limit = 10 } = req.query;
    
    const query = { isActive: true };
    
    if (category) {
        const cat = await Category.findOne({ slug: category });
        if (cat) {
            query.category = cat._id;
        }
    }
    
    if (search) {
        query.$text = { $search: search };
    }
    
    const services = await SubService.find(query)
        .populate('category', 'name slug')
        .sort('sortOrder')
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    
    const total = await SubService.countDocuments(query);
    
    new ApiResponse(200, {
        services,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    }, 'Services fetched').send(res);
});

// @desc    Get single service
// @route   GET /api/v1/services/:slug
exports.getServiceBySlug = asyncHandler(async (req, res) => {
    const service = await SubService.findOne({ 
        slug: req.params.slug,
        isActive: true 
    }).populate('category', 'name slug');
    
    if (!service) {
        throw new ApiError(404, 'Service not found');
    }
    
    // Get related services
    const relatedServices = await SubService.find({
        category: service.category,
        _id: { $ne: service._id },
        isActive: true
    }).limit(5);
    
    // Get providers for this service
    const ServiceProvider = require('../models/ServiceProvider');
    const providers = await ServiceProvider.find({
        'services.subServices': service._id,
        verificationStatus: 'verified',
        isAvailable: true
    })
        .populate('user', 'firstName lastName avatar')
        .limit(10);
    
    new ApiResponse(200, {
        service,
        relatedServices,
        providers
    }, 'Service fetched').send(res);
});

// @desc    Get featured services
// @route   GET /api/v1/services/featured
exports.getFeaturedServices = asyncHandler(async (req, res) => {
    const services = await SubService.find({
        isActive: true,
        isFeatured: true
    })
        .populate('category', 'name slug')
        .limit(8);
    
    new ApiResponse(200, { services }, 'Featured services fetched').send(res);
});

// @desc    Search services
// @route   GET /api/v1/services/search
exports.searchServices = asyncHandler(async (req, res) => {
    const { q, category } = req.query;
    
    const query = { isActive: true };
    
    if (q) {
        query.$or = [
            { name: { $regex: q, $options: 'i' } },
            { description: { $regex: q, $options: 'i' } },
            { tags: { $in: [new RegExp(q, 'i')] } }
        ];
    }
    
    if (category) {
        const cat = await Category.findOne({ slug: category });
        if (cat) {
            query.category = cat._id;
        }
    }
    
    const services = await SubService.find(query)
        .populate('category', 'name slug')
        .limit(20);
    
    new ApiResponse(200, { services, count: services.length }, 'Search results').send(res);
});

// @desc    Get popular services
// @route   GET /api/v1/services/popular
exports.getPopularServices = asyncHandler(async (req, res) => {
    const services = await SubService.find({ isActive: true })
        .sort('-bookingsCount -rating.average')
        .limit(10)
        .populate('category', 'name slug');
    
    new ApiResponse(200, { services }, 'Popular services fetched').send(res);
});