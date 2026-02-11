import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { HttpModule } from '@nestjs/axios';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FirebaseAdminService } from './firebase-admin.service';
import { FirebaseStrategy } from './firebase.strategy';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'firebase' }), HttpModule],
  controllers: [AuthController],
  providers: [AuthService, FirebaseAdminService, FirebaseStrategy],
  exports: [FirebaseAdminService, AuthService],
})
export class AuthModule {}
