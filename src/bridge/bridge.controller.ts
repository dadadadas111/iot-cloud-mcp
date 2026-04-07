import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { readFileSync } from 'fs';
import { join } from 'path';

@SkipThrottle()
@Controller('bridge')
export class BridgeController {
  private readonly installScript: string;

  constructor() {
    this.installScript = readFileSync(join(process.cwd(), 'scripts', 'bridge-install.sh'), 'utf-8');
  }

  @Get('install.sh')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  getInstallScript(): string {
    return this.installScript;
  }
}
