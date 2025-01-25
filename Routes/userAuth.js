const express = require("express");
const jwt = require("jsonwebtoken");
const Users = require("../models/Users");
const multer = require("multer");
const fs = require("fs");
const { v4: uuidv4 } = require('uuid');
const path = require("path");
const otpSender = require("./mailer");

const userAuth = express.Router();

// Function to calculate age from date of birth
const calculateAge = (dob) => {
    const birthDate = new Date(dob);
    const ageDiff = Date.now() - birthDate.getTime();
    const ageDate = new Date(ageDiff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
};

// Signup Route
userAuth.post("/signup", async (req, res) => {
    try {
        const { name, username, password, email, dob } = req.body;

        // Check for missing fields
        if (!name || !username || !password || !email || !dob) {
            return res.status(400).json({ message: 'All fields are required.' });
        }

        if (username && username.includes(" ")) {
            return res.status(400).send({ message: "Username cannot contain spaces. Please enter a valid username." });
        }

        if (username && username.length < 6) {
            return res.status(400).send({ message: "Username must be at least 6 characters long." });
        }

        // Check if user is at least 16 years old
        const age = calculateAge(dob);
        if (age < 16) {
            return res.status(400).json({ message: 'You must be at least 16 years old to sign up.' });
        }

        const user = new Users({ name, username, password, email, dob });
        const otp = await user.generateOtp();
        const token = await user.generateAuthToken();

        await user.save();

        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 180 * 24 * 60 * 60 * 1000
        });

        //username is the username of user , which provided when they will created him account.
        const otpEmailResponse = await otpSender(user.email, user.username, otp);

        res.status(200).json({
            message: 'Signup successful.',
            user: {
                name: user.name,
                username: user.username,
                email: user.email
            },
            otpExpiryTime: user.otp.expiresAt, // Include OTP expiry time in the response
            otpExpiryInMin: 5,
            isMailSent: otpEmailResponse.isMailSent
        });
    } catch (error) {
        if (error.code === 11000) {
            res.status(409).json({
                message: 'Duplicate value error. Please provide a unique value.',
                key: error.keyValue
            });
        } else {
            res.status(500).json({ message: 'Error signing up user', error: error });
        }
    }
});

// Verify OTP Route
userAuth.post("/verifyOtp", async (req, res) => {
    try {
        const token = req.cookies.authToken;
        const { otp } = req.body;

        if (!token || !otp) {
            return res.status(400).send({ message: 'Missing authentication token or OTP' });
        }

        const user = await Users.findByToken(token);

        if (!user) {
            return res.status(401).send({ message: 'Invalid or expired token' });
        }
        if (user.otp.verified) {
            return res.status(401).send({ message: 'You have already verified.' });
        }
        if (user.otp.remainChance <= 0) {
            return res.status(400).send({ message: 'You have exceeded the maximum number of OTP attempts' });
        }

        if (user.otp.expiresAt < Date.now()) {
            return res.status(400).send({ message: 'The OTP has expired. Please request a new one.' });
        }

        if (!user.verifyOtp(otp)) {
            await user.save();
            return res.status(400).send({ message: 'Invalid OTP', remainChance: user.otp.remainChance });
        }

        await user.save();
        res.send({ message: `Hello ${user.username}, welcome to your profile!` });
    } catch (error) {
        res.status(500).send({ message: 'Error verifying OTP', error: error.message });
    }
});

// Regenerate OTP Route
userAuth.post("/regenerateOtp", async (req, res) => {
    try {
        const token = req.cookies.authToken;

        if (!token) {
            return res.status(400).send({ message: 'Missing authentication token' });
        }

        const user = await Users.findByToken(token);

        if (!user) {
            return res.status(401).send({ message: 'Invalid or expired token' });
        }

        if (user.otp.verified) {
            return res.status(401).send({ message: 'You have already verified.' });
        }

        const newOtp = await user.generateOtp();
        await user.save();
        const otpEmailResponse = await otpSender(user.email, user.username, newOtp);

        res.send({ message: 'A new OTP has been generated and sent to your registered contact', isMailSent: otpEmailResponse.isMailSent });
    } catch (error) {
        res.status(500).send({ message: 'Error regenerating OTP', error: error.message });
    }
});

// Login Route
userAuth.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).send({ message: 'Username and password are required.' });
        }

        const user = await Users.findOne({ username });

        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).send({ message: 'Invalid username or password.' });
        }

        if (!user.otp.verified) {
            return res.status(401).send({ message: 'Please verify your OTP.' });
        }

        const token = await user.generateAuthToken();
        await user.save();

        res.cookie('authToken', token, { httpOnly: true, maxAge: 180 * 24 * 60 * 60 * 1000 });
        res.status(200).send({ message: 'Login successful', token });
    } catch (error) {
        res.status(500).send({ message: 'Error logging in user', error: error.message });
    }
});

// Middleware for authentication and OTP verification
const loadUser = async (req, res, next) => {
    try {
        const token = req.cookies.authToken;
        const user = await Users.findByToken(token);

        if (!user) {
            return res.status(401).send({ message: 'Invalid or expired token' });
        }

        if (!user.otp.verified) {
            return res.status(401).send({ message: 'Please verify your OTP.' });
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(500).json({ message: 'Authentication error', error: error.message });
    }
};

// Get Profile Route
userAuth.get("/profile", loadUser, (req, res) => {
    try {
        req.user.password = undefined;
        res.status(200).json(req.user);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching profile', error: error.message });
    }
});

// Get User Profile by ID
userAuth.get("/profile/:id", async (req, res) => {
    try {
        const user = await Users.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({
            id: user._id,
            username: user.username,
            name: user.name,
            avatar: user.avatar
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error, please try again later', error: error.message });
    }
});

// Logout Route
userAuth.post('/logout', loadUser, async (req, res) => {
    try {
        const user = req.user;
        const token = req.cookies.authToken;

        const tokenIndex = user.tokens.findIndex(t => t.token === token);

        if (tokenIndex !== -1) {
            user.tokens.splice(tokenIndex, 1);
        } else {
            return res.status(404).json({ message: 'Token not found' });
        }

        await user.save();
        res.status(200).json({ message: 'Successfully logged out' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to log out', error: error.message });
    }
});

// Logout All Devices Route
userAuth.post('/logoutAll', loadUser, async (req, res) => {
    try {
        req.user.tokens = [];
        await req.user.save();
        res.status(200).json({ message: 'Successfully logged out from all devices' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to log out from all devices', error: error.message });
    }
});

// Update User Route
userAuth.put('/updateUser', loadUser, async (req, res) => {
    try {
        const { name, username, newPassword, dob, oldPassword } = req.body;

        if (!(name || username || newPassword || dob)) {
            return res.status(400).send({ "message": "Please provide at least one field for update" });
        }
        if (!oldPassword) {
            return res.status(400).send({ "message": "Please provide your old password." });
        }
        if (newPassword && newPassword.length < 8) {
            return res.status(400).send({ "message": "Please provide a new password with a minimum of 8 characters" });
        }
        if (username && username.includes(" ")) {
            return res.status(400).send({ message: "Username cannot contain spaces. Please enter a valid username." });
        }

        if (username && username.length < 6) {
            return res.status(400).send({ message: "Username must be at least 6 characters long." });
        }

        if (await Users.findOne({ username })) {
            return res.status(400).send({ "message": "Username already exists" });
        }

        if (await req.user.comparePassword(oldPassword)) {
            if (username) req.user.username = username;
            if (name) req.user.name = name;
            if (newPassword) req.user.password = newPassword;
            if (dob) req.user.dob = dob;
            await req.user.save();
            return res.status(200).send({ "message": "User updated successfully" });
        } else {
            return res.status(401).send({ "message": "Incorrect old password." });
        }
    } catch (error) {
        res.status(500).json({ message: 'Failed to update user', error: error.message });
    }
});

// Upload Profile Picture Route
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        try {
            if (file.mimetype.startsWith('image/')) {
                cb(null, './uploads/profiles');
            } else {
                cb(new Error('Invalid file type for profile picture'), false);
            }
        } catch (error) {
            cb(error, false);
        }
    },
    filename: (req, file, cb) => {
        const uniqueName = uuidv4() + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const uploadProfilePicture = multer({ storage: profileStorage });

// Upload Profile Picture Route
userAuth.post('/uploadAvatar/', loadUser, async (req, res) => {
    try {
        uploadProfilePicture.single('media')(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ message: 'Error uploading profile picture', error: err.message });
            }

            if (!req.file) {
                return res.status(400).json({ message: 'No file uploaded' });
            }

            if (req.user.avatar && req.user.avatar.path) {
                try {
                    fs.unlinkSync(`./uploads${req.user.avatar.path}`);
                } catch (error) {
                    // Log file deletion error if needed
                }
            }

            req.user.avatar = {
                name: req.file.filename,
                path: req.file.path.replace("uploads", "")
            };

            await req.user.save();

            res.status(200).json({
                message: 'Profile picture uploaded successfully',
            });
        });
    } catch (error) {
        res.status(500).json({ message: 'Error uploading profile picture', error: error.message });
    }
});

module.exports = userAuth;

