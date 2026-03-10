/**
 * Widget Preview Controller
 * Dev-time endpoint for previewing widget templates in a browser
 * Access via: GET /widgets/preview/device-dashboard
 */

import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { WidgetService } from './services/widget.service';

/**
 * Preview controller for testing widget rendering during development
 * Exempt from rate limiting via @SkipThrottle()
 */
@SkipThrottle()
@Controller('widgets/preview')
export class WidgetPreviewController {
  constructor(private readonly widgetService: WidgetService) {}

  /**
   * Preview the device dashboard widget with sample data
   * GET /widgets/preview/device-dashboard
   */
  @Get('device-dashboard')
  async previewDeviceDashboard(@Res() res: Response): Promise<void> {
    const sampleData = {
      uuid: '507f1f77bcf86cd799439011',
      label: 'Living Room Light',
      desc: 'Main ceiling LED light in the living room',
      mac: 'AA:BB:CC:DD:EE:FF',
      locationId: '507f1f77bcf86cd799439022',
      groupId: '507f1f77bcf86cd799439033',
      features: { dimming: true, colorTemp: true },
      deviceType: 'LED Light',
      deviceTypeId: 1,
      brand: 'Rogo',
      ownership: 'owned',
      elementIds: [1, 2, 3],
      productId: '0100010001',
    };

    const html = await this.widgetService.render('device-dashboard', sampleData);
    res.type('text/html').send(html);
  }
}
