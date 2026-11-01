import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, PayloadTooLargeException } from '@nestjs/common';
import { MulterError } from 'multer';

@Catch(MulterError, PayloadTooLargeException)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (
      exception instanceof PayloadTooLargeException ||
      exception.code === 'LIMIT_FILE_SIZE' ||
      exception.status === 413
    ) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Dung lượng ảnh vượt quá 2MB',
        error: 'Bad Request',
      });
    }

    return response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: exception.message || 'Lỗi xử lý tệp tải lên',
      error: 'Bad Request',
    });
  }
}
