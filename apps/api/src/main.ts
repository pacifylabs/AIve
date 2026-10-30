import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { APP_CONFIG, type AppConfig } from './config/config.module.js';
import { configureApp } from './configure-app.js';

const app = await NestFactory.create(AppModule, { bufferLogs: true });
configureApp(app);
await app.listen(app.get<AppConfig>(APP_CONFIG).API_PORT);
