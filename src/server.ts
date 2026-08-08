import 'reflect-metadata'
import { env } from './config/env.js'
import logger from './shared/logger.js'

import http from 'http'
import connectDB from './config/database.js'

import app from './app.js'

const startserver  = async () => {
    try {
        await connectDB();

        const httpServer = http.createServer(app)
        
        httpServer.listen(env.PORT, () => {
            logger.info(`server running on http://localhost:${env.PORT}`)
        })
        
    } catch (error) {
        logger.error(`Error starting server:`, { error })
        process.exit(1)
    }
}

startserver()