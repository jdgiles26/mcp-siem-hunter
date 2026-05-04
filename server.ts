import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import http from "http";
import { randomUUID } from "crypto";

const execAsync = promisify(exec);

// Initialize MCP Server
const server = new Server(
  {
    name: "mcp-siem-hunter",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define Tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "capture_wireshark_traffic",
      description: "Captures live network traffic for a specified duration using local tshark. Returns CSV formatted packet data for anomaly analysis.",
      inputSchema: {
        type: "object",
        properties: {
          duration_seconds: {
            type: "number",
            description: "Duration to sniff traffic in seconds (max 30).",
            default: 5,
          },
          interface: {
            type: "string",
            description: "Network interface (e.g., 'en0', 'eth0', 'any').",
            default: "any",
          },
        },
      },
    },
    {
      name: "query_local_splunk",
      description: "Executes an SPL query against a local Splunk enterprise instance.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Splunk Search Processing Language (SPL) query.",
          },
          earliest_time: {
            type: "string",
            description: "Time modifier (e.g., '-15m', '-1h').",
            default: "-15m",
          },
        },
        required: ["query"],
      },
    },
  ],
}));

// Implement Tool Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "capture_wireshark_traffic") {
    const duration = Math.min(Number(request.params.arguments?.duration_seconds) || 5, 30);
    const iface = request.params.arguments?.interface || "any";

    try {
      // Executes real tshark: captures frames, extracts source/dest IP, protocol, and info.
      const command = `tshark -i ${iface} -a duration:${duration} -T fields -e frame.time -e ip.src -e ip.dst -e _ws.col.Protocol -e _ws.col.Info -E header=y -E separator=, -E quote=d`;
      const { stdout, stderr } = await execAsync(command);

      if (stderr && !stdout) {
        throw new Error(stderr);
      }

      return {
        content: [{ type: "text", text: stdout }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Tshark Execution Error: ${error.message}. Ensure Wireshark/tshark is installed and in PATH.` }],
        isError: true,
      };
    }
  }

  if (request.params.name === "query_local_splunk") {
    const splQuery = request.params.arguments?.query;
    const earliestTime = request.params.arguments?.earliest_time || "-15m";
    const splunkHost = process.env.SPLUNK_HOST || "https://localhost:8089";
    const splunkToken = process.env.SPLUNK_API_TOKEN;

    if (!splunkToken) {
      return {
        content: [{ type: "text", text: "Error: SPLUNK_API_TOKEN environment variable is not set." }],
        isError: true,
      };
    }

    try {
      const response = await fetch(`${splunkHost}/services/search/jobs/export`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${splunkToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          search: `search ${splQuery}`,
          output_mode: "json",
          earliest_time: earliestTime as string,
        }),
      });

      if (!response.ok) throw new Error(`Splunk API Error: ${response.statusText}`);
      
      const data = await response.text();
      return {
        content: [{ type: "text", text: data }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Splunk Connection Error: ${error.message}` }],
        isError: true,
      };
    }
  }

  throw new Error("Unknown tool requested");
});

// STDIO Mode
async function runStdio() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Local SIEM Threat Hunter MCP server running on stdio");
}

// HTTP Mode
async function runHttp(port: number) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  await server.connect(transport);

  const httpServer = http.createServer(async (req, res) => {
    // CORS headers for local UI
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health check endpoint
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: "mcp-siem-hunter", version: "1.0.0" }));
      return;
    }

    try {
      await transport.handleRequest(req, res, undefined);
    } catch (error) {
      console.error("Error handling request:", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  });

  httpServer.listen(port, () => {
    console.log(`MCP SIEM Hunter HTTP server running on http://localhost:${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
  });

  httpServer.on("error", (err) => {
    console.error("HTTP server error:", err);
  });
}

// Entry point
async function main() {
  const mode = process.env.MCP_TRANSPORT || "stdio";

  if (mode === "http") {
    const port = parseInt(process.env.MCP_PORT || "3000", 10);
    await runHttp(port);
  } else {
    await runStdio();
  }
}

main().catch(console.error);
