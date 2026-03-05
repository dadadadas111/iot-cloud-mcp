import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DiscoveryController } from './discovery.controller';

@Module({
  imports: [ConfigModule],
  controllers: [DiscoveryController],
})
export class DiscoveryModule {}
