/**
 * Widget Preview Controller
 * Dev-time endpoint for previewing widget templates in a browser.
 * Injects sample data as window.openai.toolOutput to simulate the ChatGPT iframe environment.
 * Access via: GET /widgets/preview/device-dashboard?lang=vi&theme=dark
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
  async previewDeviceDashboard(
    @Query('lang') lang: string,
    @Query('theme') theme: string,
    @Res() res: Response,
  ): Promise<void> {
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

    // Inject window.openai (toolOutput + theme) and set <html lang> for testing
    const locale = lang || 'en';
    const validTheme = theme === 'dark' || theme === 'light' ? theme : null;
    let previewHtml = widgetHtml.replace('<html lang="en">', `<html lang="${locale}">`);
    const openaiScript = validTheme
      ? `window.openai = { toolOutput: ${JSON.stringify(sampleData)}, theme: '${validTheme}' };`
      : `window.openai = { toolOutput: ${JSON.stringify(sampleData)} };`;
    previewHtml = previewHtml.replace('<script>', `<script>${openaiScript}</script>\n<script>`);

    res.type('text/html').send(previewHtml);
  }

  /**
   * Preview the device list widget with sample data.
   * GET /widgets/preview/device-list
   */
  @Get('device-list')
  async previewDeviceList(
    @Query('lang') lang: string,
    @Query('theme') theme: string,
    @Res() res: Response,
  ): Promise<void> {
    const sampleData = {
      total: 3,
      devices: [
        {
          uuid: 'dev-001',
          label: 'Living Room Light',
          desc: 'Main ceiling LED',
          mac: 'AA:BB:CC:DD:EE:01',
          deviceType: 'LIGHT',
          deviceTypeId: 1,
        },
        {
          uuid: 'dev-002',
          label: 'Bedroom AC',
          desc: 'Samsung AC',
          mac: 'AA:BB:CC:DD:EE:02',
          deviceType: 'AC',
          deviceTypeId: 11,
        },
        {
          uuid: 'dev-003',
          label: 'Front Door Lock',
          desc: 'Yale smart lock',
          mac: 'AA:BB:CC:DD:EE:03',
          deviceType: 'DOORLOCK',
          deviceTypeId: 4,
        },
      ],
    };

    const widgetHtml = await this.widgetService.readStaticHtml('device-list');

    const locale = lang || 'en';
    const validTheme = theme === 'dark' || theme === 'light' ? theme : null;
    let previewHtml = widgetHtml.replace('<html lang="en">', `<html lang="${locale}">`);
    const openaiScript = validTheme
      ? `window.openai = { toolOutput: ${JSON.stringify(sampleData)}, theme: '${validTheme}' };`
      : `window.openai = { toolOutput: ${JSON.stringify(sampleData)} };`;
    previewHtml = previewHtml.replace('<script>', `<script>${openaiScript}</script>\n<script>`);

    res.type('text/html').send(previewHtml);
  }
}
