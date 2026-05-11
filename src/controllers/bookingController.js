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
    const { 
        bookingId, 
        provider: providerId, 
        services, 
        scheduledDate, 
        scheduledTime, 
        serviceAddress, 
        payment, 
        notes,
        category
    } = req.body;

    const provider = await ServiceProvider.findById(providerId).populate('user');
    if (!provider || !provider.isAvailable) {
        throw new ApiError(400, 'Service provider is not available');
    }

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

    const gst = subtotal * 0.09; 
    const sgst = subtotal * 0.09; 
    const convenienceFee = subtotal * 0.05; 
    const total = subtotal + gst + sgst + convenienceFee;

    const finalBookingId = bookingId || `BK-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const booking = await Booking.create({
        bookingId: finalBookingId,
        customer: req.user._id,
        provider: providerId,
        category: category,
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
            status: 'pending'
        },
        customerNotes: notes
    });

    booking.timeline.push({
        status: 'pending',
        note: 'Booking created',
        updatedBy: req.user._id
    });
    await booking.save();

    // Send confirmation email to customer
    try {
        await sendEmail({
            email: req.user.email,
            subject: `Booking Confirmed - ${booking.bookingId}`,
            html: emailTemplates.bookingConfirmation(booking)
        });
    } catch (error) {
        console.error('Failed to send booking confirmation email:', error);
    }

    // Create notification for provider
    try {
        const Notification = require('../models/Notification');
        await Notification.create({
            recipient: provider.user._id,
            type: 'booking_created',
            title: 'New Booking Received',
            message: `New booking ${booking.bookingId} from ${req.user.firstName} ${req.user.lastName}`,
            reference: { model: 'Booking', id: booking._id },
            channels: { inApp: true, email: true }
        });
    } catch (notifErr) {
        console.error('Failed to create provider notification:', notifErr);
    }

    new ApiResponse(201, { booking }, 'Booking created successfully').send(res);
});

// @desc    Get all bookings for logged in user (customer or provider)
// @route   GET /api/v1/bookings/my-bookings
exports.getMyBookings = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 10 } = req.query;
    const query = {};
    
    if (req.user.role === 'customer') {
        query.customer = req.user._id;
    } else if (req.user.role === 'provider') {
        const provider = await ServiceProvider.findOne({ user: req.user._id });
        if (provider) {
            query.provider = provider._id;
        } else {
            return new ApiResponse(200, { bookings: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } }, 'Bookings fetched').send(res);
        }
    }

    if (status) query.status = status;

    const bookings = await Booking.find(query)
        .populate('customer', 'firstName lastName phone email')
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

// @desc    Get single booking
// @route   GET /api/v1/bookings/:id
exports.getBookingById = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id)
        .populate('customer', 'firstName lastName phone email')
        .populate('provider')
        .populate('items.service');

    if (!booking) throw new ApiError(404, 'Booking not found');

    if (req.user.role === 'customer' && booking.customer._id.toString() !== req.user._id.toString()) {
        throw new ApiError(403, 'Not authorized to view this booking');
    }
    if (req.user.role === 'provider') {
        const provider = await ServiceProvider.findOne({ user: req.user._id });
        if (!provider || provider._id.toString() !== booking.provider._id.toString()) {
            throw new ApiError(403, 'Not authorized to view this booking');
        }
    }

    new ApiResponse(200, { booking }, 'Booking fetched successfully').send(res);
});

// @desc    Cancel booking
// @route   PATCH /api/v1/bookings/:id/cancel
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

    // Notify provider about cancellation
    try {
        const provider = await ServiceProvider.findById(booking.provider);
        if (provider) {
            const Notification = require('../models/Notification');
            await Notification.create({
                recipient: provider.user,
                type: 'booking_cancelled',
                title: 'Booking Cancelled',
                message: `Booking ${booking.bookingId} was cancelled by ${req.user.role}`,
                reference: { model: 'Booking', id: booking._id },
                channels: { inApp: true }
            });
        }
    } catch (err) {
        console.error('Failed to send cancellation notification', err);
    }

    new ApiResponse(200, { booking }, 'Booking cancelled successfully').send(res);
});

// @desc    Confirm booking (Provider)
// @route   PATCH /api/v1/bookings/:id/confirm
exports.confirmBooking = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider || provider._id.toString() !== booking.provider.toString()) {
        throw new ApiError(403, 'Not authorized to confirm this booking');
    }

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

// @desc    Start service (Provider)
// @route   PATCH /api/v1/bookings/:id/start
exports.startService = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider || provider._id.toString() !== booking.provider.toString()) {
        throw new ApiError(403, 'Not authorized to start this booking');
    }

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

// @desc    Generate completion OTP (Provider) -> Sends OTP to customer email
// @route   POST /api/v1/bookings/:id/generate-otp
exports.generateCompletionOTP = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id)
        .populate('customer', 'email firstName lastName');

    if (!booking) throw new ApiError(404, 'Booking not found');

    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider || provider._id.toString() !== booking.provider.toString()) {
        throw new ApiError(403, 'Not authorized to generate OTP for this booking');
    }

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

    // Send OTP to customer's email
    try {
        const customerEmail = booking.customer.email;
        const customerName = `${booking.customer.firstName} ${booking.customer.lastName}`;
        
        const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Service Completion OTP</title>
                <style>
                    body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
                    .container { max-width: 500px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .otp-code { font-size: 42px; font-weight: bold; letter-spacing: 5px; background: #eef2ff; display: inline-block; padding: 12px 24px; border-radius: 8px; margin: 20px 0; }
                    .footer { margin-top: 20px; font-size: 12px; color: #888; text-align: center; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>Hello ${customerName},</h2>
                    <p>Your service provider has requested completion of your booking <strong>${booking.bookingId}</strong>.</p>
                    <p>Please share the following OTP with the provider to complete the service:</p>
                    <div style="text-align: center;">
                        <div class="otp-code">${otp}</div>
                    </div>
                    <p>This OTP is valid for <strong>30 minutes</strong>.</p>
                    <p>If you did not request this, please ignore this email.</p>
                    <div class="footer">
                        <p>GharSeva - Your trusted home service partner</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        await sendEmail({
            email: customerEmail,
            subject: `Service Completion OTP for Booking ${booking.bookingId}`,
            html: emailHtml
        });

        console.log(`OTP email sent to ${customerEmail}`);
    } catch (emailErr) {
        console.error('Failed to send OTP email:', emailErr);
        // We don't throw an error to the provider if email fails, but we log it.
        // The provider still sees the OTP in the modal (fallback)
    }

    new ApiResponse(200, { message: 'OTP generated and sent to customer email', otp }, 'OTP generated').send(res);
});

// @desc    Complete service with OTP (Provider)
// @route   PATCH /api/v1/bookings/:id/complete
exports.completeService = asyncHandler(async (req, res) => {
    const { completionOTP } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (!provider || provider._id.toString() !== booking.provider.toString()) {
        throw new ApiError(403, 'Not authorized to complete this booking');
    }

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

// @desc    Reschedule booking
// @route   PATCH /api/v1/bookings/:id/reschedule
exports.rescheduleBooking = asyncHandler(async (req, res) => {
    const { scheduledDate, scheduledTime } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    if (req.user.role === 'customer' && booking.customer.toString() !== req.user._id.toString()) {
        throw new ApiError(403, 'Not authorized');
    }
    if (req.user.role === 'provider') {
        const provider = await ServiceProvider.findOne({ user: req.user._id });
        if (!provider || provider._id.toString() !== booking.provider.toString()) {
            throw new ApiError(403, 'Not authorized');
        }
    }

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