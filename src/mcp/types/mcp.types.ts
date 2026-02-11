/**
 * MCP Protocol Types
 * Model Context Protocol v2024-11-05
 * https://spec.modelcontextprotocol.io/
 */

// Request/Response base structures
export interface McpRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, any>;
}

export interface McpResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: Record<string, any>;
  error?: McpError;
}

export interface McpError {
  code: number;
  message: string;
  data?: any;
}

// Server capabilities
export interface ServerCapabilities {
  logging?: Record<string, any>;
  resources?: {
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  sampling?: Record<string, any>;
}

export interface InitializeResponse {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

// Resources
export interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: string;
}

export interface ListResourcesResponse {
  resources: Resource[];
}

export interface ReadResourceResponse {
  contents: ResourceContent[];
}

// Tools
export interface Tool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ListToolsResponse {
  tools: Tool[];
}

export interface CallToolResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  }>;
  isError?: boolean;
}

// Prompts
export interface Prompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface GetPromptResponse {
  messages: Array<{
    role: 'user' | 'assistant';
    content: {
      type: 'text' | 'resource';
      text?: string;
      resource?: {
        uri: string;
        mimeType: string;
      };
    };
  }>;
}

// Logging
export interface LogMessageParams {
  level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';
  logger?: string;
  data?: any;
}

// Progress updates
export interface ProgressParams {
  token: string;
  progress: number;
  total?: number;
}

// Common MCP methods
export const MCP_METHODS = {
  INITIALIZE: 'initialize',
  LIST_RESOURCES: 'resources/list',
  READ_RESOURCE: 'resources/read',
  LIST_TOOLS: 'tools/list',
  CALL_TOOL: 'tools/call',
  LIST_PROMPTS: 'prompts/list',
  GET_PROMPT: 'prompts/get',
  LOG_MESSAGE: 'logging/setLevel',
};

export const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR_START: -32099,
  SERVER_ERROR_END: -32000,
  RESOURCE_NOT_FOUND: -32001,
  INVALID_REQUEST_ID: -32002,
};
