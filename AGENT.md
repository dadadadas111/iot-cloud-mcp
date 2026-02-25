# Goal: Build a Multi-Tenant MCP Gateway in NestJS
Act as an expert NestJS developer. Build a Model Context Protocol (MCP) server that acts as a proxy for an existing "Old API Server." 

## Architecture Requirements
- Use the NestJS Module system (McpModule, AuthModule, ProxyModule).
- Transport: HTTP with SSE (Server-Sent Events) for MCP.
- Multi-tenancy: Support dynamic endpoints via route parameters (e.g., /mcp/:project-api-key/sse).
(you may think it's a bit revealing. but project api key got another layer of ip security, so it's fine to be in the url)

## Core Logic
1. *Discovery & Metadata:*
   - Implement /.well-known/oauth-protected-resource and /.well-known/oauth-authorization-server.
   - These files must dynamically return URLs pointing back to the current NestJS host.

2. *OAuth Flow (Bypass to Old API):*
   - /authorize: Render a simple HTML login page. On submit, POST the email/password + API Key (sourced from the params :project-api-key earlier) to the Old API's /login.
   - /token: Capture ChatGPT's exchange request. Forward credentials to the Old API to get a JWT. Return a compliant OAuth 2.1 response (including access_token, refresh_token, and expires_in). Support exchange authorization_code and refresh_token grant types.
   - /register: Implement a stub for Dynamic Client Registration that returns a client_id. (not priority for PoC. can be a static client_id for now)

3. *MCP Tools (Proxy Logic):*
   - Create a dynamic Tool Resolver.
   - For every tool call (e.g., get_user_data):
     a. Extract userId from the Bearer Token (decode only, no strict verify for PoC).
     b. Extract api key from the URL param.
     c. Call the Old API Server using API Key + the userId.
     d. Format the JSON response into the MCP content: [{ type: 'text', text: ... }] format.

## Technical Details
- Use @rekog/mcp-nest or @modelcontextprotocol/sdk for protocol handling.
- Use axios or @nestjs/axios for the Old API calls.
- Use zod for tool parameter validation.

## File Structure
- src/mcp/ (Controller for SSE and metadata)
- src/auth/ (OAuth endpoints and logic)
- src/proxy/ (Service logic for calling the Old API)
- src/tools/ (Definitions of the AI tools)

Provide the implementation for the AppModule, the McpController, and a sample ToolService that proxies a 'fetchUser' request.

## References
to make the implementation matches the requirements and can be plugged into multiple MCP clients, you can refer to the following resources:
- https://developers.openai.com/apps-sdk/build/auth 
- https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
and any other resources you find relevant. But do not make up any assumption that is not supported by the above references. If you need to make any assumption, please ask me first.


## Note
- If you need to provide any data for the API calls, refer the the file docs/EXTERNAL-API.md. It contains the necessary endpoints and example request/response for the Old API Server. if any missing, you can make a boilerplate and i will fill in the details later. DO NOT MAKE UP ANY ASSUMPTION