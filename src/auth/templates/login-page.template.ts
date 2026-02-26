/**
 * Generates OAuth 2.1 login page HTML
 * Simple form with email/password and hidden OAuth parameters
 *
 * @param projectApiKey - Project API key from route
 * @param oauthParams - OAuth parameters from authorize request
 * @returns HTML string for login page
 */
export function generateLoginPage(
  projectApiKey: string,
  oauthParams: {
    client_id: string;
    redirect_uri: string;
    state: string;
    code_challenge?: string | undefined;
    code_challenge_method?: string | undefined;
    scope?: string;
    response_type?: string;
    resource?: string;
  },
): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign In - IoT Cloud</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .login-container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            padding: 40px;
            width: 100%;
            max-width: 420px;
        }
        .logo {
            text-align: center;
            margin-bottom: 30px;
        }
        .logo h1 {
            color: #667eea;
            font-size: 28px;
            font-weight: 700;
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-group label {
            display: block;
            color: #333;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 8px;
        }
        .form-group input {
            width: 100%;
            padding: 12px 16px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
            transition: border-color 0.3s;
        }
        .form-group input:focus {
            outline: none;
            border-color: #667eea;
        }
        .submit-btn {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .submit-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
        }
        .submit-btn:active {
            transform: translateY(0);
        }
        .oauth-info {
            margin-top: 20px;
            padding: 16px;
            background: #f8f9fa;
            border-radius: 6px;
            font-size: 12px;
            color: #666;
        }
        .oauth-info strong {
            color: #333;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">
            <h1>🔐 IoT Cloud</h1>
            <p style="color: #666; margin-top: 8px;">Sign in to continue</p>
        </div>
        
        <form method="POST" action="/auth/${projectApiKey}/login">
            <div class="form-group">
                <label for="email">Email</label>
                <input 
                    type="email" 
                    id="email" 
                    name="email" 
                    required 
                    placeholder="you@example.com"
                    autocomplete="email"
                >
            </div>
            
            <div class="form-group">
                <label for="password">Password</label>
                <input 
                    type="password" 
                    id="password" 
                    name="password" 
                    required 
                    placeholder="Enter your password"
                    autocomplete="current-password"
                >
            </div>
            
            <!-- Hidden OAuth parameters -->
            <input type="hidden" name="client_id" value="${oauthParams.client_id}">
            <input type="hidden" name="redirect_uri" value="${oauthParams.redirect_uri}">
            <input type="hidden" name="state" value="${oauthParams.state}">
            <input type="hidden" name="code_challenge" value="${oauthParams.code_challenge}">
            <input type="hidden" name="code_challenge_method" value="${oauthParams.code_challenge_method}">
            ${oauthParams.scope ? `<input type="hidden" name="scope" value="${oauthParams.scope}">` : ''}
            ${oauthParams.response_type ? `<input type="hidden" name="response_type" value="${oauthParams.response_type}">` : ''}
            ${oauthParams.resource ? `<input type="hidden" name="resource" value="${oauthParams.resource}">` : ''}
            
            <button type="submit" class="submit-btn">
                Sign In
            </button>
        </form>
        
        <div class="oauth-info">
            <strong>OAuth 2.1 Authorization</strong><br>
            Client: ${oauthParams.client_id}<br>
            ${oauthParams.scope ? `Scope: ${oauthParams.scope}<br>` : ''}
            Redirect: ${oauthParams.redirect_uri}
        </div>
    </div>
</body>
</html>
  `.trim();
}
