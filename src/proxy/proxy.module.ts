/**
 * Proxy Module
 * Handles HTTP communication with the Old API Server
 * Exposes OldApiService for use across the application
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CommonModule } from '../common/common.module';
import { OldApiService } from './services/old-api.service';

/**
 * ProxyModule provides:
 * - OldApiService: Service for calling Old API endpoints
 *
 * This module encapsulates all external API communication
 * and provides a clean interface for the rest of the application
 */
@Module({
  imports: [HttpModule, CommonModule],
  providers: [OldApiService],
  exports: [OldApiService],
})
export class ProxyModule {}
