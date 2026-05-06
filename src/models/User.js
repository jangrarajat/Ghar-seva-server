const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const addressSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['home', 'work', 'other'],
        default: 'home'
    },
    street: { type: String, required: true },
    landmark: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: {
        type: String,
        required: true,
        match: [/^[0-9]{6}$/, 'Invalid pincode']
    },
    coordinates: { latitude: Number, longitude: Number },
    isDefault: { type: Boolean, default: false }
}, { _id: true });

const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: [true, 'First name is required'],
        trim: true,
        maxlength: 50
    },
    lastName: {
        type: String,
        required: [true, 'Last name is required'],
        trim: true,
        maxlength: 50
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Invalid email format']
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        unique: true,
        match: [/^[6-9]\d{9}$/, 'Invalid Indian phone number']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: 8,
        select: false
    },
    avatar: { url: String, publicId: String },
    
    gender: { type: String, enum: ['male', 'female', 'other'] },
    dateOfBirth: Date,
    role: {
        type: String,
        enum: ['customer', 'provider', 'admin'],
        default: 'customer'
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended', 'pending_verification'],
        default: 'active'
    },
    addresses: [addressSchema],
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    googleId: String,
    facebookId: String,
    notificationPreferences: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: true },
        push: { type: Boolean, default: true }
    },
    lastLogin: Date,
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName}`;
});

// ✅ FIXED: Pre-save middleware (Mongoose 7+ style - next ki zaroorat nahi)
userSchema.pre('save', async function() {
    // Only hash password if it's modified
    if (!this.isModified('password')) return;
    
    // Hash password
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Remove duplicate indexes - keep only unique: true in schema
// userSchema.index({ email: 1 }); // ❌ Hata do - already unique: true hai
// userSchema.index({ phone: 1 }); // ❌ Hata do - already unique: true hai
userSchema.index({ role: 1, status: 1 });
userSchema.index({ 'addresses.coordinates': '2dsphere' });

const User = mongoose.model('User', userSchema);
module.exports = User;