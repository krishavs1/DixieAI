import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface CustomError extends Error {
  status?: number;
  code?: string;
}

export const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error({
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  // Default error
  let error = {
    message: err.message || 'Internal Server Error',
    status: err.status || 500,
  };

  // Handle specific errors
  if (err.name === 'ValidationError') {
    error.status = 400;
    error.message = 'Validation Error';
  }

  if (err.name === 'UnauthorizedError') {
    error.status = 401;
    error.message = 'Unauthorized';
  }

  if (err.code === 'ECONNREFUSED') {
    error.status = 503;
    error.message = 'Service Unavailable';
  }

  res.status(error.status).json({
    error: error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}; 