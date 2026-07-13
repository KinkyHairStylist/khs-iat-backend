// const express = require('express');
// const mongoose = require('mongoose');
// const dotenv = require('dotenv');
// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const nodemailer = require('nodemailer');
// const { v4: uuidv4 } = require('uuid');
//
// dotenv.config();
//
// const app = express();
// app.use(express.json());
//
// // Connect to MongoDB
// mongoose
//   .connect(process.env.MONGODB_URI, {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//   })
//   .then(() => )
//   .catch((err) => );
//
// // User Schema
// const userSchema = new mongoose.Schema({
//   email: { type: String, required: true, unique: true },
//   password: { type: String, required: true },
//   firstName: String,
//   surname: String,
//   phoneNumber: String,
//   gender: String,
//   isVerified: { type: Boolean, default: false },
//   verificationCode: String,
//   verificationExpires: Date,
//   createdAt: { type: Date, default: Date.now },
// });
//
// const User = mongoose.model('User', userSchema);
//
// // Email transporter setup
// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS,
//   },
// });
//
// // Helper: Generate 5-digit code
// const generateCode = () => Math.floor(10000 + Math.random() * 90000).toString();
//
// // Send Verification Email
// const sendVerificationEmail = async (email, code) => {
//   const mailOptions = {
//     from: process.env.EMAIL_USER,
//     to: email,
//     subject: 'Your KHS Email Verification Code',
//     text: `Your verification code is: ${code}. It is valid for 10 minutes.`,
//   };
//
//   await transporter.sendMail(mailOptions);
// };
//
// // Routes
//
// // GET /health
// app.get('/health', (req, res) => {
//   res.status(200).json({ status: 'OK' });
// });
//
// // POST /api/get-started
// app.post('/api/get-started', async (req, res) => {
//   const { email } = req.body;
//
//   if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
//     return res.status(400).json({ error: 'Valid email is required' });
//   }
//
//   try {
//     // Check if user already exists
//     let user = await User.findOne({ email });
//
//     if (!user) {
//       // Create new user with pending verification
//       user = new User({
//         email,
//         isVerified: false,
//         verificationCode: generateCode(),
//         verificationExpires: Date.now() + 10 * 60 * 1000, // 10 minutes
//       });
//
//       await user.save();
//
//       // Send verification email
//       await sendVerificationEmail(user.email, user.verificationCode);
//     } else {
//       // If user exists but not verified, regenerate code
//       if (!user.isVerified) {
//         user.verificationCode = generateCode();
//         user.verificationExpires = Date.now() + 10 * 60 * 1000;
//         await user.save();
//         await sendVerificationEmail(user.email, user.verificationCode);
//       }
//     }
//
//     res.status(200).json({ message: 'Verification code sent' });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Server error' });
//   }
// });
//
// // POST /api/verify-code
// app.post('/api/verify-code', async (req, res) => {
//   const { email, code } = req.body;
//
//   if (!email || !code) {
//     return res.status(400).json({ error: 'Email and code are required' });
//   }
//
//   try {
//     const user = await User.findOne({ email });
//
//     if (!user) {
//       return res.status(404).json({ error: 'User not found' });
//     }
//
//     if (user.isVerified) {
//       return res.status(200).json({ message: 'Already verified', user });
//     }
//
//     if (user.verificationCode !== code) {
//       return res.status(400).json({ error: 'Invalid verification code' });
//     }
//
//     if (Date.now() > user.verificationExpires) {
//       return res.status(400).json({ error: 'Verification code expired' });
//     }
//
//     // Mark as verified
//     user.isVerified = true;
//     user.verificationCode = null;
//     user.verificationExpires = null;
//     await user.save();
//
//     res.status(200).json({ message: 'Email verified successfully', user });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Server error' });
//   }
// });
//
// // POST /api/resend-code
// app.post('/api/resend-code', async (req, res) => {
//   const { email } = req.body;
//
//   if (!email) {
//     return res.status(400).json({ error: 'Email is required' });
//   }
//
//   try {
//     const user = await User.findOne({ email });
//
//     if (!user) {
//       return res.status(404).json({ error: 'User not found' });
//     }
//
//     if (user.isVerified) {
//       return res.status(200).json({ message: 'Already verified' });
//     }
//
//     // Regenerate code
//     user.verificationCode = generateCode();
//     user.verificationExpires = Date.now() + 10 * 60 * 1000;
//     await user.save();
//
//     await sendVerificationEmail(user.email, user.verificationCode);
//
//     res.status(200).json({ message: 'New verification code sent' });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Server error' });
//   }
// });
//
// // POST /api/signup
// app.post('/api/signup', async (req, res) => {
//   const { email, password, firstName, surname, phoneNumber, gender } = req.body;
//
//   if (
//     !email ||
//     !password ||
//     !firstName ||
//     !surname ||
//     !phoneNumber ||
//     !gender
//   ) {
//     return res.status(400).json({ error: 'All fields are required' });
//   }
//
//   try {
//     const user = await User.findOne({ email });
//
//     if (!user) {
//       return res.status(400).json({ error: 'User not found or not verified' });
//     }
//
//     if (!user.isVerified) {
//       return res.status(400).json({ error: 'Email not verified' });
//     }
//
//     // Hash password
//     const salt = await bcrypt.genSalt(10);
//     user.password = await bcrypt.hash(password, salt);
//     user.firstName = firstName;
//     user.surname = surname;
//     user.phoneNumber = phoneNumber;
//     user.gender = gender;
//
//     await user.save();
//
//     // Generate JWT token
//     const token = jwt.sign(
//       { id: user._id, email: user.email },
//       'process.env.JWT_SECRET',
//       { expiresIn: '7d' },
//     );
//
//     res.status(200).json({
//       message: 'Signup successful',
//       token,
//       user: {
//         id: user._id,
//         email: user.email,
//         firstName: user.firstName,
//         surname: user.surname,
//         phoneNumber: user.phoneNumber,
//         gender: user.gender,
//         isVerified: user.isVerified,
//       },
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Server error' });
//   }
// });
//
// // Start server
// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   // });
