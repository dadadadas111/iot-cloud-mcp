/**
 * Widgets Module
 * Provides widget rendering services for ChatGPT interactive UI
 * Handles Handlebars template compilation and preview endpoints
 */

import { Module } from '@nestjs/common';
import { WidgetService } from './services/widget.service';
import { WidgetPreviewController } from './widget-preview.controller';

/**
 * WidgetsModule provides:
 * - WidgetService: Handlebars template compilation and rendering
 * - WidgetPreviewController: Dev-time preview endpoint for widget templates
 */
@Module({
  controllers: [WidgetPreviewController],
  providers: [WidgetService],
  exports: [WidgetService],
})
export class WidgetsModule {}
