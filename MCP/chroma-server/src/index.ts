#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { ChromaClient, Collection, IncludeEnum } from 'chromadb';

const CHROMA_HOST = process.env.CHROMA_HOST || 'http://localhost:8000';
const CHROMA_PATH = process.env.CHROMA_PATH;

class ChromaMCPServer {
  private server: Server;
  private client: ChromaClient;

  constructor() {
    this.server = new Server(
      {
        name: 'chroma-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize ChromaDB client
    this.client = new ChromaClient({
      path: CHROMA_PATH || CHROMA_HOST,
    });

    this.setupToolHandlers();

    // Error handling
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
          name: 'create_collection',
          description: 'Create a new collection in ChromaDB',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the collection to create',
              },
              metadata: {
                type: 'object',
                description: 'Optional metadata for the collection',
                additionalProperties: true,
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'list_collections',
          description: 'List all collections in ChromaDB',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_collection',
          description: 'Get details of a specific collection',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the collection',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'add_documents',
          description: 'Add documents to a collection',
          inputSchema: {
            type: 'object',
            properties: {
              collectionName: {
                type: 'string',
                description: 'Name of the collection',
              },
              documents: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'Array of document texts',
              },
              metadatas: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                },
                description: 'Array of metadata objects (one per document)',
              },
              ids: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'Array of document IDs (one per document)',
              },
            },
            required: ['collectionName', 'documents'],
          },
        },
        {
          name: 'query_collection',
          description: 'Query documents in a collection',
          inputSchema: {
            type: 'object',
            properties: {
              collectionName: {
                type: 'string',
                description: 'Name of the collection to query',
              },
              queryText: {
                type: 'string',
                description: 'Text to search for',
              },
              nResults: {
                type: 'number',
                description: 'Number of results to return (default: 10)',
                minimum: 1,
                maximum: 100,
              },
              where: {
                type: 'object',
                description: 'Optional metadata filters',
                additionalProperties: true,
              },
            },
            required: ['collectionName', 'queryText'],
          },
        },
        {
          name: 'delete_collection',
          description: 'Delete a collection from ChromaDB',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name of the collection to delete',
              },
            },
            required: ['name'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const result = await this.handleToolCall(request.params.name, request.params.arguments);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async handleToolCall(toolName: string, args: any) {
    switch (toolName) {
      case 'create_collection':
        return await this.createCollection(args.name, args.metadata);

      case 'list_collections':
        return await this.listCollections();

      case 'get_collection':
        return await this.getCollection(args.name);

      case 'add_documents':
        return await this.addDocuments(args.collectionName, args.documents, args.metadatas, args.ids);

      case 'query_collection':
        return await this.queryCollection(args.collectionName, args.queryText, args.nResults, args.where);

      case 'delete_collection':
        return await this.deleteCollection(args.name);

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }
  }

  private async createCollection(name: string, metadata?: Record<string, any>) {
    try {
      const collection = await this.client.createCollection({
        name,
        metadata,
      });
      return {
        success: true,
        collection: {
          id: collection.id,
          name: collection.name,
          metadata: collection.metadata,
        },
      };
    } catch (error) {
      throw new Error(`Failed to create collection: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async listCollections() {
    try {
      const collections = await this.client.listCollections();
      return {
        collections: collections.map((col: Collection) => ({
          id: col.id,
          name: col.name,
          metadata: col.metadata,
        })),
      };
    } catch (error) {
      throw new Error(`Failed to list collections: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getCollection(name: string) {
    try {
      const collection = await this.client.getCollection({ name });
      return {
        collection: {
          id: collection.id,
          name: collection.name,
          metadata: collection.metadata,
        },
      };
    } catch (error) {
      throw new Error(`Failed to get collection: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async addDocuments(
    collectionName: string,
    documents: string[],
    metadatas?: Record<string, any>[],
    ids?: string[]
  ) {
    try {
      const collection = await this.client.getCollection({ name: collectionName });

      const documentIds = ids || documents.map((_, index) => `doc_${index}`);

      await collection.add({
        documents,
        metadatas: metadatas || documents.map(() => ({})),
        ids: documentIds,
      });

      return {
        success: true,
        added: documents.length,
        ids: documentIds,
      };
    } catch (error) {
      throw new Error(`Failed to add documents: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async queryCollection(
    collectionName: string,
    queryText: string,
    nResults: number = 10,
    where?: Record<string, any>
  ) {
    try {
      const collection = await this.client.getCollection({ name: collectionName });

      const results = await collection.query({
        queryTexts: [queryText],
        nResults,
        where,
        include: [IncludeEnum.documents, IncludeEnum.metadatas, IncludeEnum.distances],
      });

      return {
        query: queryText,
        results: {
          documents: results.documents[0],
          metadatas: results.metadatas[0],
          distances: results.distances ? results.distances[0] : [],
          ids: results.ids[0],
        },
      };
    } catch (error) {
      throw new Error(`Failed to query collection: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async deleteCollection(name: string) {
    try {
      await this.client.deleteCollection({ name });
      return {
        success: true,
        deleted: name,
      };
    } catch (error) {
      throw new Error(`Failed to delete collection: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Chroma MCP server running on stdio');
  }
}

const server = new ChromaMCPServer();
server.run().catch(console.error);
