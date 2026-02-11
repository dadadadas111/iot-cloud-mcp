# Setup Checklist for MCP Bridge Server

## Before First Run

- [ ] **1. Install Node.js 18+**

  ```bash
  node --version  # Should be 18.x or higher
  ```

- [ ] **2. Install dependencies**

  ```bash
  cd iot-cloud-mcp
  npm install
  ```

- [ ] **3. Get Firebase Service Account**

  - Go to Firebase Console
  - Project Settings → Service Accounts
  - Generate new private key
  - Save as `firebase-service-account.json` in project root

- [ ] **4. Configure environment variables**

  ```bash
  cp .env.example .env
  ```

  Edit `.env` and set:

  - `IOT_API_BASE_URL` - Your IoT API URL
  - `IOT_API_KEY` - Your API key (x-header-apikey)
  - `FIREBASE_SERVICE_ACCOUNT_PATH` - Path to your Firebase JSON file

- [ ] **5. Build the project**

  ```bash
  npm run build
  ```

- [ ] **6. Start development server**

  ```bash
  npm run start:dev
  ```

- [ ] **7. Test health endpoint**

  ```bash
  curl http://localhost:3001/api/health
  ```

  Should return: `{"status":"ok","timestamp":"...","service":"iot-cloud-mcp","version":"1.0.0"}`

- [ ] **8. Test authentication**

  ```bash
  curl -X POST http://localhost:3001/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}'
  ```

  Should return: `{"access_token":"...","refresh_token":"...","expires_in":3600}`

- [ ] **9. Access Swagger documentation**
      Open: http://localhost:3001/api/docs

## Next Steps

After successful setup, you can:

1. **Continue development** - Add REST API endpoints for devices, projects, etc.
2. **Deploy to cloud** - Use Railway, Render, or Heroku
3. **Integrate with ChatGPT** - Import OpenAPI spec into ChatGPT Actions
4. **Add Docker support** - For containerized deployment

## Troubleshooting

### Firebase initialization fails

- Check if `firebase-service-account.json` exists and is valid JSON
- Verify the path in `.env` is correct
- Ensure the service account has necessary permissions

### Cannot connect to IoT API

- Verify `IOT_API_BASE_URL` is reachable
- Test with curl: `curl -H "x-header-apikey: YOUR_KEY" YOUR_URL/health`
- Check if `IOT_API_KEY` is correct

### Port already in use

- Change `PORT` in `.env` to a different value (e.g., 3002)
- Or kill the process using port 3001

### Build errors

- Delete `node_modules` and `dist` folders
- Run `npm install` again
- Run `npm run build`

## Ready to Deploy?

See `IMPLEMENTATION_NOTES.md` for deployment guides and next steps!
