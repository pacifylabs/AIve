import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDataSource, DataSource } from '@ai-staff/db';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';

@Global()
@Module({
  providers: [
    {
      provide: DataSource,
      inject: [APP_CONFIG],
      useFactory: async (config: AppConfig) => {
        const db = createDataSource({
          host: config.DB_HOST,
          port: config.DB_PORT,
          database: config.DB_NAME,
          username: config.DB_APP_USER,
          password: config.DB_APP_PASSWORD,
          ssl: config.DB_SSL,
        });
        return db.initialize();
      },
    },
  ],
  exports: [DataSource],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.db.isInitialized) await this.db.destroy();
  }
}
