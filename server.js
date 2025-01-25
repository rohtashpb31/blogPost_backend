const express = require("express")
const dotenv = require("dotenv")
const { connectDB } = require("./config/db");
const Users = require("./models/Users");
const path = require("path")
const cors = require("cors")
const cookieParser = require('cookie-parser');


//CONFIGURE THE BASIC CONNECIONS.
dotenv.config();
connectDB();

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use(cors());

app.use(express.static(process.env.BUILD?process.env.BUILD:path.join(__dirname, 'build')));
app.use(express.static(path.join(__dirname, 'uploads')));


// INITIALIZING THE ENDPOINTS USING EXPRESS
// user authetication.
const userAuth = require("./Routes/userAuth");
app.use(userAuth);

const article = require("./Routes/article")
app.use("/article/", article);

const post = require("./Routes/posts")
app.use("/post", post);

// Handling errors.
app.use((err, req, res, next) => {
    let formattedErrors = {};
    const errors = {};

    if (err.name === 'ValidationError') {

        if (err.name === 'ValidationError') {
            Object.keys(err.errors).forEach(key => {
                errors[key] = err.errors[key].message;
            });
        }
    } else if (err.code === 11000) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            errors[field] = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists.`;
        }
    } else {
        formattedErrors = { general: 'An unexpected error occurred.' };
    }
    res.status(401).send(err);
})

// STARTING THE LISTENER HERE....
app.listen(process.env.EXPRESS_PORT, () => {
    console.log(`server is running on: ${process.env.EXPRESS_PORT}`);
})
