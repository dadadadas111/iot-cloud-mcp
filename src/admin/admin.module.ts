import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AdminController } from './admin.controller';
import { AdminAuthGuard } from './guards/admin-auth.guard';
import { McpModule } from '../mcp/mcp.module';

@Module({
  imports: [ConfigModule, McpModule],
  controllers: [AdminController],
  providers: [AdminAuthGuard],
})
export class AdminModule {}
