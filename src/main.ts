import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { SuccessResponseInterceptor } from './common/interceptors/success-response.interceptor';
import { join } from 'node:path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (validationErrors) => {
        const details = validationErrors.map((error) => ({
          field: error.property,
          errors: Object.values(error.constraints ?? {}),
        }));

        return new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details,
        });
      },
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new SuccessResponseInterceptor());

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
