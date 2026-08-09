import mongoose from 'mongoose'
import logger from '../shared/logger.js'
import { env } from './env.js';



const connectDB = async () => {
    try {
        await mongoose.connect(env.MONGO_URI)
        logger.info(`MongoDB connected successfully ${mongoose.connection.host}`);

        mongoose.connection.on("disconnected", () => {
            logger.warn("MongoDB disconnected");
        });

    } catch (error) {
        logger.error("MongoDB connection Failed", { error });
        throw error;
    }
}

export default connectDB