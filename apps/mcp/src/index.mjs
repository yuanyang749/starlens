#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { agentTools, callAgentTool } from "@starlens-app/agent-tools";

const DEFAULT_API_BASE_URL = "http://localhost:3000";

export function createStarlensMcpServer(env = process.env) {
  const server = new Server(
    {
      name: "starlens",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: agentTools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await callAgentTool(
        request.params.name,
        request.params.arguments ?? {},
        {
          apiBaseUrl: env.STARLENS_API_BASE_URL ?? DEFAULT_API_BASE_URL,
          token: env.STARLENS_TOKEN ?? "",
        },
      );
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : "Starlens MCP tool failed.",
          },
        ],
      };
    }
  });

  return server;
}

export async function main() {
  const server = createStarlensMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  });
}
