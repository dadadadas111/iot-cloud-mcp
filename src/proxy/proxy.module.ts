/**
 * Proxy Module
 * Handles HTTP communication with the IoT API Server
 * Exposes IotApiService for use across the application
 */

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CommonModule } from '../common/common.module';
import { IotApiService } from './services/iot-api.service';

/**
 * ProxyModule provides:
 * - IotApiService: Service for calling IoT API endpoints
 *
 * This module encapsulates all external API communication
 * and provides a clean interface for the rest of the application
 */
@Module({
  imports: [HttpModule, CommonModule],
  providers: [IotApiService],
  exports: [IotApiService],
})
export class ProxyModule {}
