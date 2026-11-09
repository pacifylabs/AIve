import { Module } from '@nestjs/common';
import { socialConfig } from '@ai-staff/config';
import { AccountTokens, FeedPoller, Keyring, RecurringPosts, safeFetchMedia } from '@ai-staff/core';
import { DataSource } from '@ai-staff/db';
import { SocialProviders } from '@ai-staff/social';
import { AuthModule } from '../auth/auth.module.js';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { SocialAccountsService } from './social-accounts.service.js';
import { MentionsService } from './mentions.service.js';
import { SchedulesService } from './schedules.service.js';
import { PostLibraryService } from './post-library.service.js';
import { PostResultsService } from './post-results.service.js';
import { SocialFeedsService } from './social-feeds.service.js';
import { SocialPostsService } from './social-posts.service.js';
import { SocialCallbackController, SocialController } from './social.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [SocialController, SocialCallbackController],
  providers: [
    {
      provide: SocialProviders,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new SocialProviders({ ...socialConfig(config), fetchMedia: (url) => safeFetchMedia(url) }),
    },
    { provide: FeedPoller, inject: [DataSource], useFactory: (db: DataSource) => new FeedPoller(db) },
    SocialAccountsService,
    SocialPostsService,
    SocialFeedsService,
    PostLibraryService,
    PostResultsService,
    SchedulesService,
    MentionsService,
    {
      provide: AccountTokens,
      inject: [DataSource, Keyring, SocialProviders],
      useFactory: (db: DataSource, keyring: Keyring, providers: SocialProviders) =>
        new AccountTokens(db, keyring, providers),
    },
    { provide: RecurringPosts, inject: [DataSource], useFactory: (db: DataSource) => new RecurringPosts(db) },
  ],
})
export class SocialModule {}
