import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ERROR_CODES } from '../constants/error-codes';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse = isHttpException
      ? (exception.getResponse() as
          | string
          | { message?: string | string[]; code?: string; details?: unknown })
      : null;

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : Array.isArray(exceptionResponse?.message)
          ? exceptionResponse.message.join(', ')
          : exceptionResponse?.message ??
            (isHttpException ? 'Request failed' : 'Internal server error');

    const code =
      typeof exceptionResponse === 'object' && exceptionResponse?.code
        ? exceptionResponse.code
        : this.mapDefaultCode(status);

    const details =
      typeof exceptionResponse === 'object' ? exceptionResponse?.details : undefined;

    response.status(status).json({
      success: false,
      message,
      error: {
        code,
        details,
      },
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private mapDefaultCode(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ERROR_CODES.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.TOO_MANY_REQUESTS;
      default:
        return ERROR_CODES.INTERNAL_SERVER_ERROR;
    }
  }
}
