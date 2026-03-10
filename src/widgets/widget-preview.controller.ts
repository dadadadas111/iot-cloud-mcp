/**
 * Widget Preview Controller
 * Dev-time endpoint for previewing widget templates in a browser.
 * Injects sample data as window.openai.toolOutput to simulate the ChatGPT iframe environment.
 * Access via: GET /widgets/preview/device-dashboard?lang=vi
 */

import { Controller, Get, Query, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { WidgetService } from './services/widget.service';

/**
 * Preview controller for testing widget rendering during development.
 * Wraps the static widget HTML in a host page that provides window.openai.toolOutput
 * with sample device data, mimicking the ChatGPT iframe bridge.
 * Exempt from rate limiting via @SkipThrottle().
 */
@SkipThrottle()
@Controller('widgets/preview')
export class WidgetPreviewController {
  constructor(private readonly widgetService: WidgetService) {}

  /**
   * Preview the device dashboard widget with sample data.
   * GET /widgets/preview/device-dashboard
   */
  @Get('device-dashboard')
  async previewDeviceDashboard(@Query('lang') lang: string, @Res() res: Response): Promise<void> {
    const sampleData = {
      uuid: '507f1f77bcf86cd799439011',
      label: 'Living Room Light',
      desc: 'Main ceiling LED light in the living room',
      mac: 'AA:BB:CC:DD:EE:FF',
      locationId: '507f1f77bcf86cd799439022',
      locationLabel: 'Living Room',
      groupId: '507f1f77bcf86cd799439033',
      groupLabel: 'Main Lights',
      features: { dimming: true, colorTemp: true },
      deviceType: 'LIGHT',
      deviceTypeId: 1,
      brand: 'Rogo',
      ownership: 'owned',
      elementIds: [1, 2, 3],
      productId: '0100010001',
      eid: 1,
      endpoint: 'mqtt://broker.rogo.io',
      state: {
        '1': {
          '1': [1, 1],
          '28': [28, 800],
          '31': [31, 2400, 900, 700],
        },
        '2': {
          '1': [1, 0],
          '28': [28, 500],
        },
        '3': {
          '1': [1, 1],
        },
      },
    };

    const widgetHtml = await this.widgetService.readStaticHtml('device-dashboard');

    // Inject window.openai.toolOutput and set <html lang> for locale testing
    const locale = lang || 'en';
    let previewHtml = widgetHtml.replace('<html lang="en">', `<html lang="${locale}">`);
    previewHtml = previewHtml.replace(
      '<script>',
      `<script>window.openai = { toolOutput: ${JSON.stringify(sampleData)} };</script>\n<script>`,
    );

    res.type('text/html').send(previewHtml);
  }
}
