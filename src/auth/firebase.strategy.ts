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
  token: string; // Store raw token for API forwarding
}

@Injectable()
export class FirebaseStrategy extends PassportStrategy(Strategy, 'firebase') {
  private readonly logger = new Logger(FirebaseStrategy.name);

  constructor(private firebaseAdmin: FirebaseAdminService) {
    super();
  }

  async validate(token: string): Promise<UserContext> {
    try {
      // const decodedToken = await this.firebaseAdmin.verifyToken(token);
      // for now just decode the payload without verification
      const decodedToken = await this.decode(token);

      this.logger.log(`Token validated for user: ${decodedToken.uid}`);

      return {
        userId: decodedToken.user_id,
        email: decodedToken.email || '',
        authTime: decodedToken.iat,
        exp: decodedToken.exp,
        emailVerified: decodedToken.email_verified || false,
        token, // Store raw token for forwarding to IoT API
      };
    } catch (error) {
      this.logger.error('Token validation failed:', error.message);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async decode(token: string): Promise<any> {
    // simple base64 decode without verification
    const payload = token.split('.')[1];
    const decodedPayload = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(decodedPayload);
  }
}
