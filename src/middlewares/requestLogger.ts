import morgan from "morgan";
import logger from "../shared/logger.js";


const stream = {
    write: (message: string) => logger.http(message.trim())
};


const requestLogger = morgan(
    ":method :url :status :res[content-length] - :response-time ms",
    {
        stream
    }
)

export default requestLogger
