import { Module } from '@nestjs/common';
import { PlatformModule } from './platform.module.js';
import { QueuesModule } from './queues.module.js';

@Module({ imports: [QueuesModule, PlatformModule] })
export class WorkerModule {}
