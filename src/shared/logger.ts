import path from 'path';
import fs from 'fs';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

//  Log Levels
const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4
};

const level = process.env.NODE_ENV === "production" ? "info" : "debug";

//  Log format
const format = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
        if (stack) {
            return `${timestamp} [${level.toUpperCase()}] : ${message} - ${stack}`;
        }
        return `${timestamp} [${level.toUpperCase()}] : ${message}`;
    })
);

//  Transports for logging
const transports : winston.transport[] = [

    new DailyRotateFile({
    filename: path.join(logDir, "app.%DATE%.log"),
    datePattern: "YYYY-MM-DD",
    maxFiles: "14d",
}),

    new DailyRotateFile({
        filename: path.join(logDir, "error.%DATE%.log"),
        level: "error",
        datePattern: "YYYY-MM-DD",
        maxFiles: "30d",
    })
];

if (process.env.NODE_ENV !== "production") {
    transports.push(
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize({ all: true }),
                winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
                winston.format.printf(({ timestamp, level, message, stack }) => {
                    if (stack) {
                        return `${timestamp} [${level}] : ${message} - ${stack}`;
                    }
                    return `${timestamp} [${level}] : ${message}`;
                })
            )
        })
    );
}

//  Logger configuration
const logger = winston.createLogger({
    level,
    levels: logLevels,
    format,
    transports
});

export default logger;