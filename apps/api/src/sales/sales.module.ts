import { Module } from '@nestjs/common';
import { Keyring, MailInbox } from '@ai-staff/core';
import { DataSource } from '@ai-staff/db';
import { RoleRegistry } from '@ai-staff/core';
import { buildProductionRegistry } from '@ai-staff/roles';
import { AuthModule } from '../auth/auth.module.js';
import {
  ConversationsController,
  HiringController,
  LeadsController,
  MailboxesController,
  PublicMailController,
} from './sales.controller.js';
import { ConversationsService } from './conversations.service.js';
import { LeadsService } from './leads.service.js';
import { MailboxService } from './mailbox.service.js';
import { StaffAdminService } from './staff.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MailboxesController, LeadsController, ConversationsController, HiringController, PublicMailController],
  providers: [
    { provide: RoleRegistry, useFactory: buildProductionRegistry },
    {
      provide: MailInbox,
      inject: [DataSource, Keyring],
      useFactory: (db: DataSource, keyring: Keyring) => new MailInbox(db, keyring),
    },
    MailboxService,
    LeadsService,
    ConversationsService,
    StaffAdminService,
  ],
})
export class SalesModule {}
