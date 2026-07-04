import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import { HTTP_STATUS } from './shared/constants/http-status.js'
import requestLogger from './middlewares/requestLogger.js'
import { errorHandler } from './shared/errors/error.middleware.js'




const app = express()

app.use(requestLogger)
app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true
}))

app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())

app.use(errorHandler)


app.get('/health', (req,res) => {
    res.status(HTTP_STATUS.OK).json({ status: 'ok', timeStamp: new Date().toISOString() })
})

export default app;