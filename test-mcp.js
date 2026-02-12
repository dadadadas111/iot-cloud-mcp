#!/usr/bin/env node

/**
 * Simple test script to verify MCP server functionality
 *
 * Usage: node test-mcp.js
 */

const http = require('http');

// Configuration
const MCP_HOST = 'localhost';
const MCP_PORT = 3001;
const MCP_PATH = '/api/mcp/sse';

// Test credentials (replace with real ones)
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'password';

console.log('🧪 MCP Server Test\n');
console.log(`📡 Connecting to: http://${MCP_HOST}:${MCP_PORT}${MCP_PATH}\n`);

// Connect to SSE endpoint
const req = http.get(
  {
    host: MCP_HOST,
    port: MCP_PORT,
    path: MCP_PATH,
    headers: {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  },
  (res) => {
    console.log(`✅ Connected! Status: ${res.statusCode}\n`);

    let buffer = '';
    let messageCount = 0;

    res.on('data', (chunk) => {
      buffer += chunk.toString();

      // Process complete messages
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      lines.forEach((line) => {
        if (line.startsWith('event:')) {
          const eventMatch = line.match(/event: (.+)/);
          const dataMatch = line.match(/data: (.+)/s);

          if (eventMatch && dataMatch) {
            const eventType = eventMatch[1];
            const data = dataMatch[1];

            messageCount++;
            console.log(`📨 Message ${messageCount}:`);
            console.log(`   Event: ${eventType}`);

            try {
              const parsed = JSON.parse(data);
              console.log(`   Data: ${JSON.stringify(parsed, null, 2)}\n`);

              // Check for initialization
              if (parsed.result?.serverInfo) {
                console.log('✅ MCP Server initialized successfully!');
                console.log(`   Server: ${parsed.result.serverInfo.name}`);
                console.log(`   Version: ${parsed.result.serverInfo.version}`);
                console.log(`   Protocol: ${parsed.result.protocolVersion}\n`);
              }

              // Check for tools list
              if (parsed.result?.tools) {
                console.log(`✅ Received ${parsed.result.tools.length} tools:`);
                parsed.result.tools.forEach((tool) => {
                  console.log(`   - ${tool.name}: ${tool.description}`);
                });
                console.log();
              }

              // Check for ready status
              if (parsed.result?.status === 'ready') {
                console.log('✅ Server is ready!');
                console.log(`   Tools available: ${parsed.result.toolCount}`);
                console.log(`   Message: ${parsed.result.message}\n`);

                console.log('🎉 All checks passed!\n');
                console.log('📝 Next steps:');
                console.log('   1. Use the login tool to authenticate');
                console.log('   2. Call other tools to interact with IoT devices\n');

                // Close connection after successful test
                setTimeout(() => {
                  console.log('✅ Test completed successfully!');
                  req.destroy();
                  process.exit(0);
                }, 1000);
              }
            } catch (error) {
              console.error(`❌ Failed to parse data: ${error.message}\n`);
            }
          }
        } else if (line.startsWith(':')) {
          // Keep-alive comment
          console.log('💓 Keep-alive received');
        }
      });
    });

    res.on('end', () => {
      console.log('📡 Connection closed by server');
    });

    res.on('error', (error) => {
      console.error(`❌ Response error: ${error.message}`);
      process.exit(1);
    });
  },
);

req.on('error', (error) => {
  console.error(`❌ Connection error: ${error.message}`);
  console.error('\n💡 Make sure the MCP server is running:');
  console.error('   npm run start:dev\n');
  process.exit(1);
});

// Timeout after 30 seconds
setTimeout(() => {
  console.error('❌ Test timeout (30s)');
  req.destroy();
  process.exit(1);
}, 30000);
