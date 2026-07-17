import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import { HTTP_STATUS } from './shared/constants/http-status.js'
import requestLogger from './middlewares/requestLogger.js'
import { errorHandler } from './shared/errors/error.middleware.js'
import authRouter from './modules/auth/routes/auth.route.js'
import tmdbRoute from './modules/tmdb/routes/tmdb.route.js'
import trackingRoute from './modules/tracking/routes/tracking.route.js'
import listRouter from './modules/lists/routes/list.route.js'
import userRouter from './modules/users/routes/user.route.js'
import youtubeRouter from './modules/youtube/routes/youtube.route.js'

const app = express()

app.use(requestLogger)
app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true
}))

app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())

app.use('/api/auth', authRouter)
app.use('/api/tmdb', tmdbRoute)
app.use('/api/tracking', trackingRoute)
app.use('/api/lists', listRouter)
app.use('/api/users', userRouter)
app.use('/api/youtube', youtubeRouter)

app.use(errorHandler)


app.get('/health', (req,res) => {
    res.status(HTTP_STATUS.OK).json({ status: 'ok', timeStamp: new Date().toISOString() })
})

export default app;