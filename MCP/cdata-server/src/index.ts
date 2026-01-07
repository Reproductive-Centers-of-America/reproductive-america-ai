#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import sqlite3 from 'sqlite3';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import csvParser from 'csv-parser';
import { Readable } from 'stream';

/**
 * CData-Style MCP Server
 * 
 * This server demonstrates unified data connectivity across multiple sources:
 * - SQL Databases (SQLite)
 * - REST APIs (HTTP/HTTPS)
 * - File-based data (CSV, JSON)
 * - Data transformations and queries
 * 
 * Inspired by CData's approach to providing standardized access to diverse data sources
 */

interface DataSource {
  type: 'sqlite' | 'api' | 'csv' | 'json';
  name: string;
  config: any;
}

class CDataMCPServer {
  private server: Server;
  private dataSources: Map<string, DataSource>;

  constructor() {
    this.server = new Server(
      {
        name: 'cdata-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.dataSources = new Map();
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
          name: 'register_data_source',
          description: 'Register a new data source (SQLite, API, CSV, or JSON file)',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Unique name for this data source',
              },
              type: {
                type: 'string',
                enum: ['sqlite', 'api', 'csv', 'json'],
                description: 'Type of data source',
              },
              config: {
                type: 'object',
                description: 'Configuration for the data source (path for files, URL for APIs, etc.)',
                properties: {
                  path: {
                    type: 'string',
                    description: 'File path for SQLite, CSV, or JSON',
                  },
                  url: {
                    type: 'string',
                    description: 'Base URL for API data sources',
                  },
                  headers: {
                    type: 'object',
                    description: 'HTTP headers for API requests',
                  },
                },
              },
            },
            required: ['name', 'type', 'config'],
          },
        },
        {
          name: 'list_data_sources',
          description: 'List all registered data sources',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'query_sql',
          description: 'Execute SQL query on a SQLite data source',
          inputSchema: {
            type: 'object',
            properties: {
              sourceName: {
                type: 'string',
                description: 'Name of the registered SQLite data source',
              },
              query: {
                type: 'string',
                description: 'SQL query to execute',
              },
            },
            required: ['sourceName', 'query'],
          },
        },
        {
          name: 'fetch_api_data',
          description: 'Fetch data from a REST API data source',
          inputSchema: {
            type: 'object',
            properties: {
              sourceName: {
                type: 'string',
                description: 'Name of the registered API data source',
              },
              endpoint: {
                type: 'string',
                description: 'API endpoint path (relative to base URL)',
              },
              method: {
                type: 'string',
                enum: ['GET', 'POST', 'PUT', 'DELETE'],
                description: 'HTTP method',
              },
              params: {
                type: 'object',
                description: 'Query parameters for the request',
              },
              body: {
                type: 'object',
                description: 'Request body for POST/PUT',
              },
            },
            required: ['sourceName', 'endpoint'],
          },
        },
        {
          name: 'read_csv',
          description: 'Read and query CSV file data',
          inputSchema: {
            type: 'object',
            properties: {
              sourceName: {
                type: 'string',
                description: 'Name of the registered CSV data source',
              },
              filter: {
                type: 'object',
                description: 'Optional filters to apply (column: value)',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of rows to return',
              },
            },
            required: ['sourceName'],
          },
        },
        {
          name: 'read_json',
          description: 'Read and query JSON file data',
          inputSchema: {
            type: 'object',
            properties: {
              sourceName: {
                type: 'string',
                description: 'Name of the registered JSON data source',
              },
              jsonPath: {
                type: 'string',
                description: 'JSONPath query (e.g., "$.users[*].name")',
              },
            },
            required: ['sourceName'],
          },
        },
        {
          name: 'create_sample_database',
          description: 'Create a sample SQLite database with demo data for testing',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path where to create the sample database',
              },
            },
            required: ['path'],
          },
        },
        {
          name: 'transform_data',
          description: 'Transform data using common operations (filter, map, aggregate)',
          inputSchema: {
            type: 'object',
            properties: {
              sourceName: {
                type: 'string',
                description: 'Name of the data source',
              },
              operation: {
                type: 'string',
                enum: ['count', 'sum', 'average', 'group_by'],
                description: 'Transformation operation to perform',
              },
              field: {
                type: 'string',
                description: 'Field name for the operation',
              },
            },
            required: ['sourceName', 'operation'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const result = await this.handleToolCall(
          request.params.name,
          request.params.arguments
        );
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
      case 'register_data_source':
        return await this.registerDataSource(args.name, args.type, args.config);
      case 'list_data_sources':
        return await this.listDataSources();
      case 'query_sql':
        return await this.querySql(args.sourceName, args.query);
      case 'fetch_api_data':
        return await this.fetchApiData(
          args.sourceName,
          args.endpoint,
          args.method || 'GET',
          args.params,
          args.body
        );
      case 'read_csv':
        return await this.readCsv(args.sourceName, args.filter, args.limit);
      case 'read_json':
        return await this.readJson(args.sourceName, args.jsonPath);
      case 'create_sample_database':
        return await this.createSampleDatabase(args.path);
      case 'transform_data':
        return await this.transformData(args.sourceName, args.operation, args.field);
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }
  }

  private async registerDataSource(name: string, type: string, config: any) {
    if (this.dataSources.has(name)) {
      throw new Error(`Data source '${name}' already exists`);
    }

    const dataSource: DataSource = { type: type as any, name, config };
    
    // Validate configuration based on type
    switch (type) {
      case 'sqlite':
      case 'csv':
      case 'json':
        if (!config.path) {
          throw new Error(`'path' is required for ${type} data sources`);
        }
        // Check if file exists
        if (!fs.existsSync(config.path)) {
          throw new Error(`File not found: ${config.path}`);
        }
        break;
      case 'api':
        if (!config.url) {
          throw new Error("'url' is required for API data sources");
        }
        break;
    }

    this.dataSources.set(name, dataSource);

    return {
      success: true,
      message: `Data source '${name}' registered successfully`,
      dataSource: {
        name,
        type,
        config,
      },
    };
  }

  private async listDataSources() {
    const sources = Array.from(this.dataSources.values()).map((ds) => ({
      name: ds.name,
      type: ds.type,
      config: ds.config,
    }));

    return {
      count: sources.length,
      dataSources: sources,
    };
  }

  private async querySql(sourceName: string, query: string): Promise<any> {
    const dataSource = this.dataSources.get(sourceName);
    if (!dataSource) {
      throw new Error(`Data source '${sourceName}' not found`);
    }
    if (dataSource.type !== 'sqlite') {
      throw new Error(`Data source '${sourceName}' is not a SQLite database`);
    }

    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dataSource.config.path, (err) => {
        if (err) {
          reject(new Error(`Failed to open database: ${err.message}`));
          return;
        }
      });

      db.all(query, [], (err, rows) => {
        if (err) {
          db.close();
          reject(new Error(`Query failed: ${err.message}`));
          return;
        }

        db.close((closeErr) => {
          if (closeErr) {
            console.error('Error closing database:', closeErr);
          }
        });

        resolve({
          success: true,
          rowCount: rows.length,
          data: rows,
        });
      });
    });
  }

  private async fetchApiData(
    sourceName: string,
    endpoint: string,
    method: string = 'GET',
    params?: any,
    body?: any
  ) {
    const dataSource = this.dataSources.get(sourceName);
    if (!dataSource) {
      throw new Error(`Data source '${sourceName}' not found`);
    }
    if (dataSource.type !== 'api') {
      throw new Error(`Data source '${sourceName}' is not an API`);
    }

    const url = `${dataSource.config.url}${endpoint}`;
    const config: any = {
      method,
      url,
      headers: dataSource.config.headers || {},
    };

    if (params) {
      config.params = params;
    }
    if (body && (method === 'POST' || method === 'PUT')) {
      config.data = body;
    }

    try {
      const response = await axios(config);
      return {
        success: true,
        status: response.status,
        headers: response.headers,
        data: response.data,
      };
    } catch (error: any) {
      throw new Error(
        `API request failed: ${error.response?.statusText || error.message}`
      );
    }
  }

  private async readCsv(sourceName: string, filter?: any, limit?: number): Promise<any> {
    const dataSource = this.dataSources.get(sourceName);
    if (!dataSource) {
      throw new Error(`Data source '${sourceName}' not found`);
    }
    if (dataSource.type !== 'csv') {
      throw new Error(`Data source '${sourceName}' is not a CSV file`);
    }

    return new Promise((resolve, reject) => {
      const records: any[] = [];
      const stream = fs.createReadStream(dataSource.config.path);

      stream
        .pipe(csvParser())
        .on('data', (row: any) => {
          // Apply filters if provided
          if (filter) {
            const matches = Object.entries(filter).every(([key, value]) => {
              return row[key] === value;
            });
            if (matches) {
              records.push(row);
            }
          } else {
            records.push(row);
          }

          // Apply limit if provided
          if (limit && records.length >= limit) {
            stream.destroy();
          }
        })
        .on('end', () => {
          resolve({
            success: true,
            rowCount: records.length,
            data: records,
          });
        })
        .on('error', (error: Error) => {
          reject(new Error(`Failed to read CSV: ${error.message}`));
        });
    });
  }

  private async readJson(sourceName: string, jsonPath?: string) {
    const dataSource = this.dataSources.get(sourceName);
    if (!dataSource) {
      throw new Error(`Data source '${sourceName}' not found`);
    }
    if (dataSource.type !== 'json') {
      throw new Error(`Data source '${sourceName}' is not a JSON file`);
    }

    const fileContent = fs.readFileSync(dataSource.config.path, 'utf-8');
    const data = JSON.parse(fileContent);

    // Simple JSONPath implementation (basic support)
    let result = data;
    if (jsonPath) {
      // Remove leading $. and split by .
      const pathParts = jsonPath.replace(/^\$\./, '').split('.');
      for (const part of pathParts) {
        if (part.includes('[') && part.includes(']')) {
          // Handle array indexing like "users[0]"
          const [field, index] = part.split('[');
          const idx = parseInt(index.replace(']', ''));
          result = result[field][idx];
        } else if (part === '*') {
          // Handle wildcard
          if (Array.isArray(result)) {
            result = result;
          } else {
            result = Object.values(result);
          }
        } else {
          result = result[part];
        }
      }
    }

    return {
      success: true,
      data: result,
    };
  }

  private async createSampleDatabase(dbPath: string) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          reject(new Error(`Failed to create database: ${err.message}`));
          return;
        }
      });

      db.serialize(() => {
        // Create tables
        db.run(`
          CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE,
            country TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          )
        `);

        db.run(`
          CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            product TEXT,
            amount REAL,
            order_date TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(customer_id) REFERENCES customers(id)
          )
        `);

        // Insert sample data
        const customers = [
          ['Alice Johnson', 'alice@example.com', 'USA'],
          ['Bob Smith', 'bob@example.com', 'UK'],
          ['Carol White', 'carol@example.com', 'Canada'],
          ['David Brown', 'david@example.com', 'Australia'],
        ];

        const customerStmt = db.prepare(
          'INSERT INTO customers (name, email, country) VALUES (?, ?, ?)'
        );
        customers.forEach((customer) => {
          customerStmt.run(customer);
        });
        customerStmt.finalize();

        const orders = [
          [1, 'Laptop', 1299.99],
          [1, 'Mouse', 29.99],
          [2, 'Keyboard', 89.99],
          [3, 'Monitor', 399.99],
          [4, 'Headphones', 149.99],
          [2, 'Webcam', 79.99],
        ];

        const orderStmt = db.prepare(
          'INSERT INTO orders (customer_id, product, amount) VALUES (?, ?, ?)'
        );
        orders.forEach((order) => {
          orderStmt.run(order);
        });
        orderStmt.finalize();

        db.close((closeErr) => {
          if (closeErr) {
            reject(new Error(`Failed to close database: ${closeErr.message}`));
            return;
          }
          resolve({
            success: true,
            message: `Sample database created at: ${dbPath}`,
            info: {
              tables: ['customers', 'orders'],
              sampleData: {
                customers: customers.length,
                orders: orders.length,
              },
            },
          });
        });
      });
    });
  }

  private async transformData(sourceName: string, operation: string, field?: string) {
    // This is a simplified transformation example
    // In a real implementation, you'd fetch data from the source and transform it
    
    const dataSource = this.dataSources.get(sourceName);
    if (!dataSource) {
      throw new Error(`Data source '${sourceName}' not found`);
    }

    // For demonstration, we'll show what the transformation would do
    return {
      success: true,
      message: `Transformation '${operation}' would be applied to data source '${sourceName}'`,
      operation,
      field,
      note: 'This is a demo - full implementation would require fetching and processing actual data',
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('CData MCP server running on stdio');
  }
}

const server = new CDataMCPServer();
server.run().catch(console.error);
