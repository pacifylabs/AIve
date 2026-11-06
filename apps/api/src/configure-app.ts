import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { ProblemFilter } from './common/problem.filter.js';
import { APP_CONFIG, type AppConfig } from './config/config.module.js';

/** Shared by main.ts and the tests, so tests exercise the same prefix, filters, limits and headers as production. */
export function configureApp(app: INestApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);
  const express = app as NestExpressApplication;
  express.useLogger(app.get(Logger));
  express.disable('x-powered-by');
  // Only trust X-Forwarded-For when a known number of proxies sits in front; otherwise clients could pick their own IP.
  if (config.TRUST_PROXY_HOPS > 0) express.set('trust proxy', config.TRUST_PROXY_HOPS);
  express.useBodyParser('json', { limit: '100kb' });
  // Meta's callbacks arrive as a form.
  express.useBodyParser('urlencoded', { extended: false, limit: '10kb' });
  express.enableCors({ origin: config.WEB_ORIGIN, credentials: true });
  express.use((_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  express.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });
  express.useGlobalFilters(new ProblemFilter());
  express.enableShutdownHooks();
}
