const mongoose = require('mongoose');

const workingHoursSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    required: true
  },
  isWorking: {
    type: Boolean,
    default: true
  },
  slots: [{
    startTime: String,
    endTime: String
  }]
}, { _id: false });

const documentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['aadhar', 'pan', 'driving_license', 'certificate', 'other'],
    required: true
  },
  documentNumber: String,
  frontImage: {
    url: String,
    publicId: String
  },
  backImage: {
    url: String,
    publicId: String
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verifiedAt: Date,
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { _id: true, timestamps: true });

const bankDetailsSchema = new mongoose.Schema({
  accountHolderName: {
    type: String,
    required: true
  },
  accountNumber: {
    type: String,
    required: true
  },
  ifscCode: {
    type: String,
    required: true,
    match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code']
  },
  bankName: String,
  branchName: String,
  isVerified: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const serviceProviderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  businessName: {
    type: String,
    trim: true,
    maxlength: 100
  },
  bio: {
    type: String,
    maxlength: 500
  },
  experience: {
    years: { type: Number, min: 0, max: 50 },
    description: String
  },
  services: [{
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true
    },
    subServices: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubService'
    }],
    customPrice: Number,
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  serviceArea: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true
    },
    radius: {
      type: Number,
      default: 10,
      min: 1,
      max: 50
    },
    pincodes: [String],
    cities: [String]
  },
  workingHours: [workingHoursSchema],
  documents: [documentSchema],
  verificationStatus: {
    type: String,
    enum: ['pending', 'under_review', 'verified', 'rejected'],
    default: 'pending'
  },
  verificationNote: String,
  verifiedAt: Date,
  bankDetails: bankDetailsSchema,
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    },
    breakdown: {
      five: { type: Number, default: 0 },
      four: { type: Number, default: 0 },
      three: { type: Number, default: 0 },
      two: { type: Number, default: 0 },
      one: { type: Number, default: 0 }
    }
  },
  stats: {
    totalBookings: { type: Number, default: 0 },
    completedBookings: { type: Number, default: 0 },
    cancelledBookings: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    responseRate: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 }
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  unavailableDates: [Date],
  isFeatured: {
    type: Boolean,
    default: false
  },
  featuredUntil: Date,
  commissionRate: {
    type: Number,
    default: 20,
    min: 0,
    max: 100
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
serviceProviderSchema.index({ 'serviceArea': '2dsphere' });
serviceProviderSchema.index({ 'services.category': 1 });
serviceProviderSchema.index({ verificationStatus: 1 });
serviceProviderSchema.index({ 'rating.average': -1 });
serviceProviderSchema.index({ isAvailable: 1, verificationStatus: 1 });

const ServiceProvider = mongoose.model('ServiceProvider', serviceProviderSchema);
module.exports = ServiceProvider;