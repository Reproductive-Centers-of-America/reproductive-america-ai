#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';

const API_KEY = process.env.POSTMAN_API_KEY;
if (!API_KEY) {
  throw new Error('POSTMAN_API_KEY environment variable is required');
}

interface PostmanCollection {
  id: string;
  name: string;
  uid: string;
}

interface PostmanWorkspace {
  id: string;
  name: string;
  type: string;
}

class PostmanServer {
  private server: Server;
  private axiosInstance: AxiosInstance;

  constructor() {
    this.server = new Server(
      {
        name: 'postman-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: 'https://api.getpostman.com',
      headers: {
        'X-Api-Key': API_KEY,
        'Content-Type': 'application/json',
      },
    });

    this.setupToolHandlers();

    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_workspaces',
          description: 'List all Postman workspaces',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'list_collections',
          description: 'List all collections in a workspace',
          inputSchema: {
            type: 'object',
            properties: {
              workspace_id: {
                type: 'string',
                description: 'Workspace ID (optional, lists all if not provided)',
              },
            },
          },
        },
        {
          name: 'create_request',
          description: 'Create a new request in a Postman collection',
          inputSchema: {
            type: 'object',
            properties: {
              collection_id: {
                type: 'string',
                description: 'Collection ID to add the request to',
              },
              name: {
                type: 'string',
                description: 'Name of the request',
              },
              method: {
                type: 'string',
                description: 'HTTP method (GET, POST, PUT, DELETE, etc.)',
              },
              url: {
                type: 'string',
                description: 'Request URL',
              },
              headers: {
                type: 'object',
                description: 'Request headers as key-value pairs (optional)',
              },
              body: {
                type: 'object',
                description: 'Request body configuration (optional)',
                properties: {
                  mode: {
                    type: 'string',
                    description: 'Body mode: raw, urlencoded, formdata, etc.',
                  },
                  raw: {
                    type: 'string',
                    description: 'Raw body content (for mode=raw)',
                  },
                  formdata: {
                    type: 'array',
                    description: 'Form data array (for mode=formdata)',
                  },
                },
              },
            },
            required: ['collection_id', 'name', 'method', 'url'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        if (request.params.name === 'list_workspaces') {
          const response = await this.axiosInstance.get('/workspaces');
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data.workspaces, null, 2),
              },
            ],
          };
        }

        if (request.params.name === 'list_collections') {
          const args = request.params.arguments as any;
          let url = '/collections';
          if (args?.workspace_id) {
            url = `/workspaces/${args.workspace_id}/collections`;
          }
          const response = await this.axiosInstance.get(url);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response.data.collections, null, 2),
              },
            ],
          };
        }

        if (request.params.name === 'create_request') {
          const args = request.params.arguments as any;

          // First, get the collection to update it
          const collectionResponse = await this.axiosInstance.get(
            `/collections/${args.collection_id}`
          );
          const collection = collectionResponse.data.collection;

          // Build the request object
          const newRequest: any = {
            name: args.name,
            request: {
              method: args.method,
              header: [],
              url: {
                raw: args.url,
                protocol: args.url.startsWith('https') ? 'https' : 'http',
                host: args.url.replace(/^https?:\/\//, '').split('/')[0].split('.'),
                path: args.url.replace(/^https?:\/\/[^/]+/, '').split('/').filter(Boolean),
              },
            },
          };

          // Add headers if provided
          if (args.headers) {
            newRequest.request.header = Object.entries(args.headers).map(
              ([key, value]) => ({
                key,
                value,
                type: 'text',
              })
            );
          }

          // Add body if provided
          if (args.body) {
            newRequest.request.body = args.body;
          }

          // Add the new request to the collection's items
          if (!collection.item) {
            collection.item = [];
          }
          collection.item.push(newRequest);

          // Update the collection
          const updateResponse = await this.axiosInstance.put(
            `/collections/${args.collection_id}`,
            {
              collection: collection,
            }
          );

          return {
            content: [
              {
                type: 'text',
                text: `Request "${args.name}" created successfully in collection ${args.collection_id}`,
              },
            ],
          };
        }

        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      } catch (error) {
        if (axios.isAxiosError(error)) {
          return {
            content: [
              {
                type: 'text',
                text: `Postman API error: ${
                  error.response?.data?.error?.message ||
                  error.response?.data?.message ||
                  error.message
                }`,
              },
            ],
            isError: true,
          };
        }
        throw error;
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Postman MCP server running on stdio');
  }
}

const server = new PostmanServer();
server.run().catch(console.error);
