const mongoose = require("mongoose");
const eValidator = require("email-validator");
const bcrypt = require("bcrypt");
const jwt = require('jsonwebtoken');

const TokenSchema = new mongoose.Schema({
    token: {
        type: String,
        required: [true, 'Token is required'],
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    expiresAt: {
        type: Date,
        required: [true, 'Expiration date is required'],
    }
}, {
    _id: false
});

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: [true, 'Username already exists'],
        trim: true,
        minlength: [4, 'Username must be at least 4 characters long']
    },
    avatar: {
        name: { type: String, },
        path: { type: String },
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters long']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: [true, 'Email already exists'],
        lowercase: true,
        trim: true,
        validate: {
            validator: function (v) {
                return eValidator.validate(v);
            },
            message: props => `${props.value} is not a valid email.`
        }
    },
    dob: {
        type: Date,
        required: [true, 'Date of birth is required']
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    otp: {
        value: {
            type: String,
            required: false
        },
        remainChance: {
            type: Number,
            required: false
        },
        expiresAt: {
            type: Date,
            required: false,
            index: { expires: '0s' }  // TTL index to auto-delete document after OTP expires
        },
        verified: {
            type: Boolean,
            default: false
        }
    },
    sessions: [{
        sessionId: {
            type: String,
            required: [true, 'Session ID is required']
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        expiresAt: {
            type: Date,
            required: [true, 'Session expiration date is required']
        }
    }],
    tokens: [TokenSchema]
}, {
    timestamps: true
});

// Hash the password before saving the user document
UserSchema.pre("save", async function (next) {
    if (!this.isModified("password")) {
        return next();
    }
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (e) {
        return next(e);
    }
});

// Pre-save middleware to remove expired tokens
UserSchema.pre("save", function (next) {
    const currentTime = Date.now();
    this.tokens = this.tokens.filter(token => token.expiresAt > currentTime);
    next();
});

// Compare input password with the hashed password
UserSchema.methods.comparePassword = async function (password) {
    return bcrypt.compare(password, this.password);
};

// Generate OTP and set the expiration time
UserSchema.methods.generateOtp = function () {
    const otpValue = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);  // OTP expires in 5 minutes

    this.otp.value = otpValue;
    this.otp.expiresAt = otpExpiresAt;
    this.otp.verified = false;
    this.otp.remainChance = 5;

    return otpValue;
};

// Verify the OTP entered by the user
UserSchema.methods.verifyOtp = function (otp) {
    if (this.otp.value && this.otp.value == otp && this.otp.expiresAt > Date.now()) {
        this.otp.verified = true;
        this.otp.value = undefined;
        this.otp.expiresAt = undefined;
        this.otp.remainChance = undefined;
        return true;
    } else if (this.otp.value && this.otp.expiresAt > Date.now()) {
        this.otp.remainChance = this.otp.remainChance - 1;
    }
    return false;
};

// Method to generate JWT and add it to tokens array
UserSchema.methods.generateAuthToken = function () {
    const user = this;
    const token = jwt.sign({ user: user.username }, process.env.JWT_SECRET, {
        expiresIn: '180d'  // Token valid for 6 months
    });

    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // Approx. 6 months

    user.tokens.push({ token, expiresAt });
    return token;
};

UserSchema.statics.findByToken = async function (token) {
    try {
        const user = await this.findOne({
            tokens: {
                $elemMatch: {
                    token: token,
                    expiresAt: { $gt: Date.now() }  // Token must not be expired
                }
            }
        });
        return user;
    } catch (error) {
        throw new Error('Token is not valid.');
    }
};

module.exports = mongoose.model("Users", UserSchema);
