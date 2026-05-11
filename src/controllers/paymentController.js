const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const Wallet = require('../models/Wallet');
const Settings = require('../models/Settings');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const Razorpay = require('razorpay');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const getCommission = async () => {
  const setting = await Settings.findOne({ key: 'commission' });
  return setting ? setting.value : 20; // default 20%
};

// @desc    Create payment order for a booking (called from customer)
// @route   POST /api/v1/payments/create-order
exports.createOrder = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.payment.status === 'paid') throw new ApiError(400, 'Payment already completed');

  const amount = Math.round(booking.pricing.total * 100); // paise

  const options = {
    amount,
    currency: 'INR',
    receipt: `rcpt_${booking.bookingId}`,
    notes: {
      bookingId: booking._id.toString(),
      customerId: req.user._id.toString(),
      providerId: booking.provider.toString(),
    },
  };

  const order = await razorpay.orders.create(options);

  await Payment.create({
    booking: booking._id,
    customer: req.user._id,
    provider: booking.provider,
    amount: booking.pricing.total,
    razorpayOrderId: order.id,
    receipt: order.receipt,
    commission: { percentage: 0, amount: 0, providerEarning: 0 },
  });

  new ApiResponse(
    200,
    { orderId: order.id, amount: order.amount, currency: order.currency, bookingId: booking._id },
    'Order created'
  ).send(res);
});

// @desc    Verify payment + credit provider wallet after commission
// @route   POST /api/v1/payments/verify
exports.verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const crypto = require('crypto');
  const sign = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSign = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(sign.toString())
    .digest('hex');

  if (expectedSign !== razorpay_signature) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  const payment = await Payment.findOneAndUpdate(
    { razorpayOrderId: razorpay_order_id },
    {
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      status: 'paid',
      method: 'online',
    },
    { new: true }
  );
  if (!payment) throw new ApiError(404, 'Payment record not found');

  const commissionPercentage = await getCommission();
  const totalAmount = payment.amount;
  const commissionAmount = (totalAmount * commissionPercentage) / 100;
  const providerEarning = totalAmount - commissionAmount;

  payment.commission = {
    percentage: commissionPercentage,
    amount: commissionAmount,
    providerEarning: providerEarning,
  };
  await payment.save();

  const booking = await Booking.findByIdAndUpdate(
    payment.booking,
    {
      'payment.status': 'paid',
      'payment.transactionId': razorpay_payment_id,
      'payment.paidAt': new Date(),
      'payment.paidAmount': totalAmount,
    },
    { new: true }
  );

  // Credit provider wallet
  let wallet = await Wallet.findOne({ user: payment.provider });
  if (!wallet) wallet = await Wallet.create({ user: payment.provider });
  wallet.balance += providerEarning;
  wallet.totalEarnings += providerEarning;
  wallet.transactions.push({
    type: 'credit',
    amount: providerEarning,
    description: `Earning from booking ${booking.bookingId} (${commissionPercentage}% commission deducted)`,
    balance: wallet.balance,
  });
  await wallet.save();

  // Send notification to provider (optional)
  const Notification = require('../models/Notification');
  await Notification.create({
    recipient: payment.provider,
    type: 'payment_received',
    title: 'Payment Received',
    message: `₹${providerEarning} credited to your wallet for booking ${booking.bookingId}`,
    channels: { inApp: true },
  });

  new ApiResponse(200, { payment, wallet, booking }, 'Payment verified & wallet credited').send(res);
});

// @desc    Get payment history (unchanged)
exports.getPaymentHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const query = {};
  if (req.user.role === 'customer') query.customer = req.user._id;
  else if (req.user.role === 'provider') {
    const provider = await ServiceProvider.findOne({ user: req.user._id });
    if (provider) query.provider = provider._id;
  }
  const payments = await Payment.find(query)
    .populate('booking', 'bookingId scheduledDate')
    .sort('-createdAt')
    .skip((page - 1) * limit)
    .limit(parseInt(limit));
  const total = await Payment.countDocuments(query);
  new ApiResponse(
    200,
    { payments, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
    'Payment history fetched'
  ).send(res);
});

// @desc    Withdraw from wallet (unchanged, uses withdrawalRequest model)
// This is replaced by WithdrawalRequest flow, but kept for backward compatibility
exports.withdrawFromWallet = asyncHandler(async (req, res) => {
  // This endpoint is deprecated – use withdrawal request flow instead.
  throw new ApiError(400, 'Use withdrawal request flow');
});