#!/usr/bin/env node
/**
 * CLI test script for MCP SIEM Hunter
 * Usage:
 *   node test-cli.js wireshark [interface] [duration]
 *   node test-cli.js splunk "SPL_QUERY" [earliest_time]
 *   node test-cli.js list-tools
 */

import { spawn } from "child_process";

const MCP_SERVER = "node";
const MCP_SERVER_ARGS = ["dist/server.js"];

function sendMessage(proc, msg) {
  const json = JSON.stringify(msg);
  proc.stdin.write(json + "\n");
}

function callTool(proc, name, args) {
  sendMessage(proc, {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: { name, arguments: args },
  });
}

function listTools(proc) {
  sendMessage(proc, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  });
}

function initialize(proc) {
  sendMessage(proc, {
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-cli", version: "1.0.0" },
    },
  });
}

function runTest(command, ...args) {
  const proc = spawn(MCP_SERVER, MCP_SERVER_ARGS, {
    stdio: ["pipe", "pipe", "inherit"],
    env: process.env,
  });

  let buffer = "";
  let initialized = false;

  proc.stdout.on("data", (data) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id === 0 && msg.result) {
          initialized = true;
          sendMessage(proc, { jsonrpc: "2.0", method: "notifications/initialized" });

          if (command === "list-tools") {
            listTools(proc);
          } else if (command === "wireshark") {
            callTool(proc, "capture_wireshark_traffic", {
              interface: args[0] || "any",
              duration_seconds: parseInt(args[1] || "5", 10),
            });
          } else if (command === "splunk") {
            if (!args[0]) {
              console.error("Usage: node test-cli.js splunk \"SPL_QUERY\" [earliest_time]");
              proc.kill();
              process.exit(1);
            }
            callTool(proc, "query_local_splunk", {
              query: args[0],
              earliest_time: args[1] || "-15m",
            });
          } else {
            console.log("Unknown command:", command);
            proc.kill();
            process.exit(1);
          }
        }

        if (msg.result && msg.id !== 0) {
          console.log("\n=== RESULT ===\n");
          if (msg.result.content?.[0]?.text) {
            console.log(msg.result.content[0].text);
          } else {
            console.log(JSON.stringify(msg.result, null, 2));
          }
          console.log("\n==============\n");
          proc.kill();
        }

        if (msg.error) {
          console.error("\n=== ERROR ===\n");
          console.error(JSON.stringify(msg.error, null, 2));
          console.error("\n=============\n");
          proc.kill();
        }
      } catch (e) {
        // Non-JSON line (e.g., server logs)
      }
    }
  });

  proc.on("exit", (code) => {
    process.exit(code || 0);
  });

  initialize(proc);
}

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.log(`
MCP SIEM Hunter CLI Test Tool

Usage:
  node test-cli.js list-tools
    - List available tools

  node test-cli.js wireshark [interface] [duration_seconds]
    - Capture network traffic (default: interface=any, duration=5)

  node test-cli.js splunk "SPL_QUERY" [earliest_time]
    - Run a Splunk query (requires SPLUNK_API_TOKEN env var)

Examples:
  node test-cli.js list-tools
  node test-cli.js wireshark en0 10
  node test-cli.js splunk "index=_internal | head 5" "-1h"
`);
  process.exit(0);
}

runTest(command, ...args);
