const Booking = require('../models/Booking');
const ServiceProvider = require('../models/ServiceProvider');
const SubService = require('../models/SubService');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { sendEmail, emailTemplates } = require('../utils/sendEmail');

// @desc    Create new booking
// @route   POST /api/v1/bookings
exports.createBooking = asyncHandler(async (req, res) => {
    // 1. Request body se saara data nikaalein (including bookingId)[cite: 2]
    const { 
        bookingId, 
        provider: providerId, 
        services, 
        scheduledDate, 
        scheduledTime, 
        serviceAddress, 
        payment, 
        notes 
    } = req.body;

    // 2. Validate provider exists and is active[cite: 2]
    const provider = await ServiceProvider.findById(providerId).populate('user');
    if (!provider || !provider.isAvailable) {
        throw new ApiError(400, 'Service provider is not available');
    }

    // 3. Pricing calculation logic[cite: 2]
    let subtotal = 0;
    const bookingItems = [];

    for (const item of services) {
        const service = await SubService.findById(item.service);
        if (!service) {
            throw new ApiError(404, `Service ${item.service} not found`);
        }

        const unitPrice = item.customPrice || service.basePrice;
        const totalPrice = unitPrice * (item.quantity || 1);

        bookingItems.push({
            service: service._id,
            serviceName: service.name,
            quantity: item.quantity || 1,
            unitPrice,
            totalPrice,
            notes: item.notes
        });

        subtotal += totalPrice;
    }

    // 4. Taxes and convenience fee[cite: 2]
    const gst = subtotal * 0.09; 
    const sgst = subtotal * 0.09; 
    const convenienceFee = subtotal * 0.05; 
    const total = subtotal + gst + sgst + convenienceFee;

    // 5. Booking ID handle karein (Required field fix)[cite: 2]
    // Agar frontend se nahi aaya toh random generate karein taaki schema fail na ho
    const finalBookingId = bookingId || `BK-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 6. Create booking entry in Database[cite: 2]
    const booking = await Booking.create({
        bookingId: finalBookingId, // Mapping the ID correctly[cite: 2]
        customer: req.user._id,
        provider: providerId,
        category: services[0].category,
        items: bookingItems,
        scheduledDate,
        scheduledTime,
        serviceAddress: {
            ...serviceAddress,
            ...(req.user.addresses.find(addr => addr._id.toString() === serviceAddress.addressId) || {})
        },
        pricing: {
            subtotal,
            taxes: { gst, sgst, cgst: 0 },
            convenienceFee,
            total
        },
        payment: {
            method: payment.method,
            status: 'pending' // Default status[cite: 2]
        },
        customerNotes: notes
    });

    // 7. Initial timeline status[cite: 2]
    booking.timeline.push({
        status: 'pending',
        note: 'Booking created',
        updatedBy: req.user._id
    });
    await booking.save();

    // 8. Confirmation Email[cite: 2]
    try {
        await sendEmail({
            email: req.user.email,
            subject: `Booking Confirmed - ${booking.bookingId}`,
            html: emailTemplates.bookingConfirmation(booking)
        });
    } catch (error) {
        console.error('Failed to send booking confirmation email:', error);
    }

    new ApiResponse(201, { booking }, 'Booking created successfully').send(res);
});

// @desc    Get all bookings for logged in user[cite: 2]
exports.getMyBookings = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 10 } = req.query;
    const query = {};
    
    if (req.user.role === 'customer') {
        query.customer = req.user._id;
    } else if (req.user.role === 'provider') {
        const provider = await ServiceProvider.findOne({ user: req.user._id });
        if (provider) {
            query.provider = provider._id;
        }
    }

    if (status) query.status = status;

    const bookings = await Booking.find(query)
        .populate('customer', 'firstName lastName phone')
        .populate('provider', 'businessName rating')
        .populate('items.service', 'name')
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

// @desc    Get single booking[cite: 2]
exports.getBookingById = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id)
        .populate('customer', 'firstName lastName phone email')
        .populate('provider')
        .populate('items.service');

    if (!booking) throw new ApiError(404, 'Booking not found');

    if (req.user.role === 'customer' && booking.customer._id.toString() !== req.user._id.toString()) {
        throw new ApiError(403, 'Not authorized to view this booking');
    }

    new ApiResponse(200, { booking }, 'Booking fetched successfully').send(res);
});

// @desc    Cancel booking[cite: 2]
exports.cancelBooking = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    if (!['pending', 'confirmed'].includes(booking.status)) {
        throw new ApiError(400, `Cannot cancel booking in ${booking.status} status`);
    }

    if (req.user.role === 'customer' && booking.customer.toString() !== req.user._id.toString()) {
        throw new ApiError(403, 'Not authorized to cancel this booking');
    }

    booking.status = 'cancelled';
    booking.cancellation = {
        cancelledBy: req.user.role,
        reason: req.body.reason,
        cancelledAt: new Date()
    };

    booking.timeline.push({
        status: 'cancelled',
        note: `Booking cancelled by ${req.user.role}`,
        updatedBy: req.user._id
    });

    await booking.save();
    new ApiResponse(200, { booking }, 'Booking cancelled successfully').send(res);
});

// @desc    Confirm booking (Provider)[cite: 2]
exports.confirmBooking = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    if (booking.status !== 'pending') {
        throw new ApiError(400, 'Can only confirm pending bookings');
    }

    booking.status = 'confirmed';
    booking.timeline.push({
        status: 'confirmed',
        note: 'Booking confirmed by provider',
        updatedBy: req.user._id
    });

    await booking.save();
    new ApiResponse(200, { booking }, 'Booking confirmed successfully').send(res);
});

// @desc    Start service (Provider)[cite: 2]
exports.startService = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    if (booking.status !== 'confirmed') {
        throw new ApiError(400, 'Can only start confirmed bookings');
    }

    booking.status = 'in_progress';
    booking.actualTimes.serviceStarted = new Date();
    booking.timeline.push({
        status: 'in_progress',
        note: 'Service started',
        updatedBy: req.user._id
    });

    await booking.save();
    new ApiResponse(200, { booking }, 'Service started').send(res);
});

// @desc    Generate completion OTP[cite: 2]
exports.generateCompletionOTP = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    if (booking.status !== 'in_progress') {
        throw new ApiError(400, 'Can only generate OTP for in-progress bookings');
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    booking.otp = {
        code: otp,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), 
        verified: false
    };

    await booking.save();
    new ApiResponse(200, { message: 'OTP generated', otp }, 'OTP generated').send(res);
});

// @desc    Complete service with OTP[cite: 2]
exports.completeService = asyncHandler(async (req, res) => {
    const { completionOTP } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    if (booking.status !== 'in_progress') {
        throw new ApiError(400, 'Can only complete in-progress bookings');
    }

    if (!booking.otp || booking.otp.code !== completionOTP) {
        throw new ApiError(400, 'Invalid or missing OTP');
    }

    if (new Date() > booking.otp.expiresAt) {
        throw new ApiError(400, 'OTP expired');
    }

    booking.status = 'completed';
    booking.otp.verified = true;
    booking.actualTimes.serviceCompleted = new Date();
    booking.timeline.push({
        status: 'completed',
        note: 'Service completed',
        updatedBy: req.user._id
    });

    await booking.save();

    await ServiceProvider.findByIdAndUpdate(booking.provider, {
        $inc: { 'stats.completedBookings': 1, 'stats.totalEarnings': booking.pricing.total }
    });

    new ApiResponse(200, { booking }, 'Service completed').send(res);
});

// @desc    Reschedule booking[cite: 2]
exports.rescheduleBooking = asyncHandler(async (req, res) => {
    const { scheduledDate, scheduledTime } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    booking.scheduledDate = scheduledDate;
    booking.scheduledTime = scheduledTime;
    booking.isRescheduled = true;
    booking.timeline.push({
        status: booking.status,
        note: 'Booking rescheduled',
        updatedBy: req.user._id
    });

    await booking.save();
    new ApiResponse(200, { booking }, 'Booking rescheduled').send(res);
});