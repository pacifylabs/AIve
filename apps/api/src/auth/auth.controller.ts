import { Body, Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import {
  forgotPasswordRequest,
  loginMfaRequest,
  loginRequest,
  logoutRequest,
  mfaDisableRequest,
  mfaVerifyRequest,
  refreshRequest,
  resendVerificationRequest,
  resetPasswordRequest,
  signupRequest,
  verifyEmailRequest,
} from '@ai-staff/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe.js';
import { AccessTokenGuard, type AuthUser, CurrentUser } from './access-token.guard.js';
import { AuthService, type ClientInfo } from './auth.service.js';
import { MfaService } from './mfa.service.js';

const client = (request: Request): ClientInfo => ({
  ip: request.ip ?? 'unknown',
  userAgent: request.headers['user-agent'],
});

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(MfaService) private readonly mfa: MfaService,
  ) {}

  @Post('signup')
  @HttpCode(202)
  async signup(@Body(new ZodPipe(signupRequest)) body: z.output<typeof signupRequest>, @Req() request: Request) {
    await this.auth.signup(body, client(request));
    return { status: 'check_email' };
  }

  @Post('verify-email/resend')
  @HttpCode(202)
  async resend(
    @Body(new ZodPipe(resendVerificationRequest)) body: z.output<typeof resendVerificationRequest>,
    @Req() request: Request,
  ) {
    await this.auth.resendVerification(body.email, client(request));
    return { status: 'check_email' };
  }

  @Post('verify-email')
  @HttpCode(200)
  verify(@Body(new ZodPipe(verifyEmailRequest)) body: z.output<typeof verifyEmailRequest>, @Req() request: Request) {
    return this.auth.verifyEmail(body.email, body.code, client(request));
  }

  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodPipe(loginRequest)) body: z.output<typeof loginRequest>, @Req() request: Request) {
    return this.auth.login(body.email, body.password, client(request));
  }

  @Post('login/mfa')
  @HttpCode(200)
  loginMfa(@Body(new ZodPipe(loginMfaRequest)) body: z.output<typeof loginMfaRequest>, @Req() request: Request) {
    return this.auth.loginWithMfa(body.mfaToken, body.code, client(request));
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodPipe(refreshRequest)) body: z.output<typeof refreshRequest>, @Req() request: Request) {
    return this.auth.refresh(body.refreshToken, client(request));
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodPipe(logoutRequest)) body: z.output<typeof logoutRequest>) {
    await this.auth.logout(body.refreshToken);
  }

  @Post('password/forgot')
  @HttpCode(202)
  async forgot(
    @Body(new ZodPipe(forgotPasswordRequest)) body: z.output<typeof forgotPasswordRequest>,
    @Req() request: Request,
  ) {
    await this.auth.forgotPassword(body.email, client(request));
    return { status: 'check_email' };
  }

  @Post('password/reset')
  @HttpCode(204)
  async reset(@Body(new ZodPipe(resetPasswordRequest)) body: z.output<typeof resetPasswordRequest>) {
    await this.auth.resetPassword(body.token, body.password);
  }

  @Post('mfa/enable')
  @UseGuards(AccessTokenGuard)
  @HttpCode(200)
  enableMfa(@CurrentUser() user: AuthUser) {
    return this.mfa.startEnrolment(user.id);
  }

  @Post('mfa/verify')
  @UseGuards(AccessTokenGuard)
  @HttpCode(204)
  async verifyMfa(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(mfaVerifyRequest)) body: z.output<typeof mfaVerifyRequest>,
  ) {
    await this.mfa.confirmEnrolment(user.id, body.code);
  }

  @Post('mfa/disable')
  @UseGuards(AccessTokenGuard)
  @HttpCode(204)
  async disableMfa(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(mfaDisableRequest)) body: z.output<typeof mfaDisableRequest>,
  ) {
    await this.mfa.disable(user.id, body.code, body.password);
  }
}

@Controller('me')
@UseGuards(AccessTokenGuard)
export class MeController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
