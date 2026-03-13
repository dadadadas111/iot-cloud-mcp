/**
 * Widget Preview Controller
 * Dev-time endpoint for previewing widget templates in a browser.
 * Injects sample data as window.openai.toolOutput to simulate the ChatGPT iframe environment.
 * Access via: GET /widgets/preview/device-app?lang=vi&theme=dark&view=list
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
   * Preview the unified device app widget with sample data.
   * Accepts ?view=list|dashboard|control to select the initial view.
   * GET /widgets/preview/device-app
   */
  @Get('device-app')
  async previewDeviceApp(
    @Query('lang') lang: string,
    @Query('theme') theme: string,
    @Query('view') view: string,
    @Res() res: Response,
  ): Promise<void> {
    // Sample data varies by view
    const VALID_VIEWS = ['list', 'dashboard', 'control', 'location', 'group'];
    const viewHint = VALID_VIEWS.includes(view) ? view : 'list';
    const listData = {
      _view: 'list',
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

    const dashboardData = {
      _view: 'dashboard',
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

    const controlData = {
      _view: 'control',
      uuid: '507f1f77bcf86cd799439011',
      label: 'Living Room Light',
      desc: 'Main ceiling light in the living area',
      deviceType: 'LIGHT',
      deviceTypeId: 1,
      mac: '9c9e6eed3444',
      productId: 'RG-BLE-LB01',
      locationId: 'loc-001',
      groupId: 'grp-001',
      elementIds: [1, 2, 3],
      locationLabel: 'Living Room',
      groupLabel: 'Main Lights',
      brand: 'Rogo',
      ownership: 'owner',
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

    const locationData = {
      _view: 'location',
      locationId: '507f1f77bcf86cd799439022',
      locationLabel: 'Living Room',
      total: 2,
      devices: [
        {
          uuid: 'dev-001',
          label: 'Living Room Light',
          desc: 'Main ceiling LED',
          mac: 'AA:BB:CC:DD:EE:01',
          deviceType: 'LIGHT',
          deviceTypeId: 1,
          locationId: '507f1f77bcf86cd799439022',
          groupId: '507f1f77bcf86cd799439033',
        },
        {
          uuid: 'dev-004',
          label: 'Living Room Fan',
          desc: 'Ceiling fan',
          mac: 'AA:BB:CC:DD:EE:04',
          deviceType: 'FAN',
          deviceTypeId: 7,
          locationId: '507f1f77bcf86cd799439022',
          groupId: null,
        },
      ],
    };
    const groupData = {
      _view: 'group',
      groupId: '507f1f77bcf86cd799439033',
      groupLabel: 'Main Lights',
      total: 2,
      devices: [
        {
          uuid: 'dev-001',
          label: 'Living Room Light',
          desc: 'Main ceiling LED',
          mac: 'AA:BB:CC:DD:EE:01',
          deviceType: 'LIGHT',
          deviceTypeId: 1,
          locationId: '507f1f77bcf86cd799439022',
          groupId: '507f1f77bcf86cd799439033',
        },
        {
          uuid: 'dev-005',
          label: 'Kitchen Light',
          desc: 'Under-cabinet LED',
          mac: 'AA:BB:CC:DD:EE:05',
          deviceType: 'LIGHT',
          deviceTypeId: 1,
          locationId: '507f1f77bcf86cd799439055',
          groupId: '507f1f77bcf86cd799439033',
        },
      ],
    };
    const sampleDataMap: Record<string, unknown> = {
      list: listData,
      dashboard: dashboardData,
      control: controlData,
      location: locationData,
      group: groupData,
    };
    const sampleData = sampleDataMap[viewHint];

    const widgetHtml = await this.widgetService.readStaticHtml('device-app');

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
