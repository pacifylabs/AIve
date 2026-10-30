import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { RateLimiter } from '../redis/rate-limiter.service.js';
import { AccessTokenGuard } from './access-token.guard.js';
import { AuthController, MeController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailCodesService } from './email-codes.service.js';
import { MfaService } from './mfa.service.js';
import { TokensService } from './tokens.service.js';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.JWT_ACCESS_SECRET,
        signOptions: { algorithm: 'HS256', issuer: 'ai-staff', audience: 'ai-staff-api' },
        verifyOptions: { algorithms: ['HS256'], issuer: 'ai-staff', audience: 'ai-staff-api' },
      }),
    }),
  ],
  controllers: [AuthController, MeController],
  providers: [AuthService, TokensService, EmailCodesService, MfaService, AccessTokenGuard, RateLimiter],
  exports: [AccessTokenGuard, TokensService, RateLimiter],
})
export class AuthModule {}
