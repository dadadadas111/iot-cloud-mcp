/**
 * Widgets Module
 * Provides widget services for ChatGPT interactive UI (OpenAI Apps SDK)
 * Handles static HTML widget reading for MCP resources and Handlebars preview rendering
 */

import { Module } from '@nestjs/common';
import { WidgetService } from './services/widget.service';
import { WidgetPreviewController } from './widget-preview.controller';

/**
 * WidgetsModule provides:
 * - WidgetService: Static HTML reading (MCP resources) + Handlebars preview rendering
 * - WidgetPreviewController: Dev-time preview endpoint with injected sample data
 */
@Module({
  controllers: [WidgetPreviewController],
  providers: [WidgetService],
  exports: [WidgetService],
})
export class WidgetsModule {}
