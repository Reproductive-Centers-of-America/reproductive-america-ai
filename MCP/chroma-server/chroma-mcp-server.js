#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ChromaMcpServer {
  private server;
  private chromaDbPath;
  private chromaProcess;

  constructor() {
    this.chromaDbPath = path.join(__dirname, 'chroma_db');
    this.server = new Server(
      {
        name: 'chroma-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.server.onerror = (error) => console.error('[MCP Error]', error);

    process.on('SIGINT', async () => {
      await this.server.close();
      if (this.chromaProcess) {
        this.chromaProcess.kill();
      }
      process.exit(0);
    });
  }

  async ensureChromaInstalled() {
    try {
      // Check if chromadb is installed
      execSync('python3 -c "import chromadb"', { stdio: 'pipe' });
    } catch (error) {
      console.log('Chroma not found, installing...');
      execSync('pip3 install chromadb', { stdio: 'inherit' });
    }
  }

  async startChromaServer() {
    // Ensure chroma database directory exists
    if (!fs.existsSync(this.chromaDbPath)) {
      fs.mkdirSync(this.chromaDbPath, { recursive: true });
    }

    // Start chroma server in client-server mode
    this.chromaProcess = execSync(
      `chroma run --path ${this.chromaDbPath} &`,
      { shell: '/bin/bash' }
    );

    // Give it a moment to start
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'create_collection',
          description: 'Create a new collection in Chroma',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the collection to create',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'add_documents',
          description: 'Add documents to a Chroma collection',
          inputSchema: {
            type: 'object',
            properties: {
              collection_name: {
                type: 'string',
                description: 'Name of the collection',
              },
              documents: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of document texts',
              },
              metadatas: {
                type: 'array',
                items: { type: 'object' },
                description: 'Array of metadata objects',
              },
              ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of document IDs',
              },
            },
            required: ['collection_name', 'documents'],
          },
        },
        {
          name: 'query_collection',
          description: 'Query a Chroma collection for similar documents',
          inputSchema: {
            type: 'object',
            properties: {
              collection_name: {
                type: 'string',
                description: 'Name of the collection to query',
              },
              query_texts: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of query texts',
              },
              n_results: {
                type: 'number',
                description: 'Number of results to return',
                default: 5,
              },
            },
            required: ['collection_name', 'query_texts'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        await this.ensureChromaInstalled();
        await this.startChromaServer();

        const { name, arguments: args } = request.params;

        // Import chromadb dynamically
        const chromadb = await import('chromadb');

        // Create client pointing to our local server
        const client = new chromadb.HttpClient('localhost', 8000);

        switch (name) {
          case 'create_collection':
            const collection = await client.createCollection(args.name);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    collection_name: args.name,
                    message: `Collection '${args.name}' created successfully`
                  }),
                },
              ],
            };

          case 'add_documents':
            const addCollection = await client.getCollection(args.collection_name);
            const addResult = await addCollection.add({
              documents: args.documents,
              metadatas: args.metadatas || [],
              ids: args.ids || undefined,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    added_count: addResult.ids?.length || 0,
                    message: `Added ${addResult.ids?.length || 0} documents to collection '${args.collection_name}'`
                  }),
                },
              ],
            };

          case 'query_collection':
            const queryCollection = await client.getCollection(args.collection_name);
            const queryResult = await queryCollection.query({
              query_texts: args.query_texts,
              n_results: args.n_results || 5,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    results: queryResult,
                    message: `Found ${queryResult.documents?.length || 0} results`
                  }),
                },
              ],
            };

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        console.error('Error in Chroma MCP server:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Chroma MCP server running on stdio');
  }
}

const server = new ChromaMcpServer();
server.run().catch(console.error);
