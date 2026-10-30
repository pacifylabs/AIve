import { Global, Module } from '@nestjs/common';
import { parseKeyring } from '@ai-staff/config';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { Keyring } from './crypto.js';

@Global()
@Module({
  providers: [
    {
      provide: Keyring,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new Keyring(parseKeyring(config), config.ENCRYPTION_ACTIVE_KID),
    },
  ],
  exports: [Keyring],
})
export class CryptoModule {}
