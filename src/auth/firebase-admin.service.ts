import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';

@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAdminService.name);
  private app: admin.app.App;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    try {
      let serviceAccount: any;

      // Try to load from file path first
      const serviceAccountPath = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');

      if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
        this.logger.log(`Loading Firebase service account from: ${serviceAccountPath}`);
        serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      } else {
        // Try to load from inline JSON (for cloud deployments)
        const serviceAccountJson = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT');

        if (serviceAccountJson) {
          this.logger.log('Loading Firebase service account from environment variable');
          serviceAccount = JSON.parse(serviceAccountJson);
        } else {
          throw new Error(
            'Firebase service account not found. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT',
          );
        }
      }

      this.app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      this.logger.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK:', error.message);
      throw error;
    }
  }

  async verifyToken(token: string): Promise<admin.auth.DecodedIdToken> {
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      return decodedToken;
    } catch (error) {
      this.logger.error('Token verification failed:', error.message);
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  getAuth() {
    return admin.auth();
  }

  getApp() {
    return this.app;
  }
}
