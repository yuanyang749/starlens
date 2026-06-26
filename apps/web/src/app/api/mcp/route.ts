import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { agentTools, callAgentTool } from "@starlens-app/agent-tools";
import { unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";

// 中文注释：优先读取环境变量，未配置时回退到官方 Hosted 默认值，支持自托管部署。
const HOSTED_API_BASE_URL = process.env.STARLENS_API_BASE_URL ?? "https://starlens.520ai.xin";

async function handleMcp(request: Request): Promise<Response> {
  const user = await getApiUser(request);
  if (!user) {
    return unauthorized();
  }

  // Extract the raw bearer token to forward to agent-tools HTTP calls
  const authorization = request.headers.get("authorization") ?? "";
  const [, bearerToken] = authorization.split(/\s+/, 2);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — one transport per request
    enableJsonResponse: true,      // simpler for serverless; no long-lived SSE streams
  });

  const server = new Server(
    { name: "starlens", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: agentTools }));

  server.setRequestHandler(CallToolRequestSchema, async (mcpRequest) => {
    try {
      return await callAgentTool(
        mcpRequest.params.name,
        mcpRequest.params.arguments ?? {},
        {
          apiBaseUrl: HOSTED_API_BASE_URL,
          token: bearerToken ?? "",
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

  await server.connect(transport);
  const response = await transport.handleRequest(request);
  await server.close();
  return response;
}

export const GET = handleMcp;
export const POST = handleMcp;
export const DELETE = handleMcp;
