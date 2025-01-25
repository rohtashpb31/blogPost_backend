const mongoose = require("mongoose")
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.DATABASE_URL)
        console.log("MongoDb Connected Successfully!")
    } catch (error) {
        console.log(`MongoDB Connection is Failed: ${error.message}`);
        process.exit(1);
    }
}
module.exports = { connectDB };