const ejs = require('ejs');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config(); // Load environment variables

// Create a transporter object using SMTP transport
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST, // SMTP server address
  port: parseInt(process.env.EMAIL_PORT, 10), // SMTP port, ensure it's an integer
  secure: process.env.EMAIL_SECURE === 'true', // Use SSL/TLS
  auth: {
    user: process.env.EMAIL_USER, // Your email address
    pass: process.env.EMAIL_PASS // Your email password
  }
});

// Define the mailer function
// `username` refers to the username of the user for whom the OTP is being sent.
// It is different from the email username (i.e., the username used for the mail server authentication).
const otpSender = async (to, username, otp) => {
  const mailTemplatePath = path.join(__dirname, '../Templates/mail.ejs');
  if (!to || !username || !otp) {
    return {
      isMailSent: false,
      message: "Some value is missing."
    };
  }

  try {
    // Create an OTP HTML template
    const html = await ejs.renderFile(mailTemplatePath, { username, otp });

    // Send mail via nodemailer
    const mailOptions = {
      from: `"${process.env.EMAIL_SENDER_NAME}" <${process.env.EMAIL_USER}>`, // Sender address with name
      to: to, // List of recipients
      subject: "Your OTP Code for Verification", // Subject line
      html: html // HTML body content
    };

    const response = await transporter.sendMail(mailOptions);
    return {
      isMailSent: true,
      message: "Mail sent.",
      response: response
    };
  } catch (error) {
    return {
      isMailSent: false,
      message: "Mail not sent.",
      error: error
    };
  }
};

// Export the mailer function
module.exports = otpSender;
