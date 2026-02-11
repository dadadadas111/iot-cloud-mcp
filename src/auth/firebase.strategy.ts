import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-http-bearer';
import { FirebaseAdminService } from './firebase-admin.service';

export interface UserContext {
  userId: string;
  email: string;
  authTime: number;
  exp: number;
  emailVerified: boolean;
}

@Injectable()
export class FirebaseStrategy extends PassportStrategy(Strategy, 'firebase') {
  private readonly logger = new Logger(FirebaseStrategy.name);

  constructor(private firebaseAdmin: FirebaseAdminService) {
    super();
  }

  async validate(token: string): Promise<UserContext> {
    try {
      const decodedToken = await this.firebaseAdmin.verifyToken(token);

      this.logger.log(`Token validated for user: ${decodedToken.uid}`);

      return {
        userId: decodedToken.uid,
        email: decodedToken.email || '',
        authTime: decodedToken.auth_time,
        exp: decodedToken.exp,
        emailVerified: decodedToken.email_verified || false,
      };
    } catch (error) {
      this.logger.error('Token validation failed:', error.message);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
