# MCP SIEM Hunter

A Model Context Protocol (MCP) server that provides security operations tools for network traffic capture and SIEM querying.

## Overview

MCP SIEM Hunter exposes two primary tools to MCP clients:

- **`capture_wireshark_traffic`** — Captures live network traffic using local `tshark` and returns CSV-formatted packet data for anomaly analysis.
- **`query_local_splunk`** — Executes SPL (Search Processing Language) queries against a local Splunk Enterprise instance via its REST API.

## Prerequisites

- **Node.js** (v18 or later recommended)
- **npm**
- **tshark** / Wireshark — installed and available in your system `PATH` (required for traffic capture)
- **Splunk Enterprise** — running and accessible (required only for Splunk queries)

## Is This Dependent on Splunk?

**No.** The server works independently:

| Tool | Needs Splunk? | Needs tshark? |
|------|---------------|---------------|
| `capture_wireshark_traffic` | ❌ No | ✅ Yes |
| `query_local_splunk` | ✅ Yes | ❌ No |

You can use the Wireshark capture tool without ever setting up Splunk.

## Installation

Install dependencies:

```bash
npm install
```

## Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

This outputs compiled files to the `dist/` directory.

## Configuration

The following environment variables are used:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SPLUNK_API_TOKEN` | Yes (for Splunk queries) | — | Splunk authentication bearer token |
| `SPLUNK_HOST` | No | `https://localhost:8089` | Splunk management API host |
| `MCP_TRANSPORT` | No | `stdio` | Transport mode: `stdio` or `http` |
| `MCP_PORT` | No | `3000` | HTTP server port (when `MCP_TRANSPORT=http`) |

## Running the Server

### Option 1: STDIO Mode (for Claude Desktop / AI hosts)

This is the default. The server communicates via JSON-RPC over standard input/output.

```bash
npm run start
```

Or directly:

```bash
node dist/server.js
```

### Option 2: HTTP Mode (for web UIs, custom apps)

Run with HTTP transport so browsers and HTTP clients can connect:

```bash
npm run start:http
```

Or with a custom port:

```bash
MCP_TRANSPORT=http MCP_PORT=8080 node dist/server.js
```

When running in HTTP mode:
- **MCP endpoint:** `POST http://localhost:3000/`
- **Health check:** `GET http://localhost:3000/health`
- **CORS:** Enabled for local development

### Option 3: Claude Desktop Configuration

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "siem-hunter": {
      "command": "node",
      "args": ["/full/path/to/mcp-siem-hunter/dist/server.js"],
      "env": {
        "SPLUNK_API_TOKEN": "your-token-here",
        "SPLUNK_HOST": "https://localhost:8089"
      }
    }
  }
}
```

## Using the Web UI

A simple HTML dashboard is included in `public/index.html`.

1. Start the server in HTTP mode:
   ```bash
   npm run start:http
   ```

2. Open `public/index.html` in your browser:
   ```bash
   open public/index.html
   ```

3. The UI auto-connects to `http://localhost:3000` and lets you:
   - Capture network traffic with configurable interface and duration
   - Run Splunk SPL queries
   - View results directly in the browser

## Monitoring Network Traffic

The web UI and CLI are **control panels** — they send commands to the MCP server, which runs `tshark` directly on your machine's network interfaces. The captured packet data is then returned for display.

```
┌─────────────────┐      HTTP      ┌─────────────────┐      Shell      ┌─────────────┐
│  Web UI         │  ───────────►  │  MCP Server     │  ───────────►  │   tshark    │
│  (browser)      │                │  (Node.js)      │                │  (your NIC) │
└─────────────────┘                └─────────────────┘                └─────────────┘
```

### Step 1: Install tshark / Wireshark

**macOS:**
```bash
brew install wireshark
```
Or download from [wireshark.org](https://www.wireshark.org/download.html).

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install tshark
```

**Windows:**
Download the Wireshark installer — it includes `tshark.exe`.

Verify installation:
```bash
tshark --version
```

### Step 2: Find Your Network Interface

```bash
# macOS
ifconfig

# Linux
ip link show

# Or list capture interfaces with tshark
tshark -D
```

Common interfaces:
- `en0` — Wi-Fi on Mac
- `eth0` — Ethernet on Linux
- `lo0` / `lo` — Loopback (local-only traffic)
- `any` — All interfaces combined (Linux only, often requires root)

### Step 3: Fix Capture Permissions (macOS / Linux)

`tshark` requires root/admin privileges to capture packets. Choose one option:

**Option A: Run the server with `sudo`** (quickest for testing)
```bash
sudo MCP_TRANSPORT=http npm run start:http
```

**Option B: Grant tshark capabilities** (recommended — persists across reboots)

**macOS:** Install Wireshark's **ChmodBPF** package during setup, or run:
```bash
sudo chmod +x /dev/bpf*
```

**Linux:**
```bash
sudo setcap cap_net_raw,cap_net_admin=eip $(which tshark)
```

**Windows:** Run your terminal as Administrator.

### Step 4: Capture Traffic

**Via Web UI:**
1. Start the server: `npm run start:http`
2. Open `public/index.html` in your browser
3. Enter your interface name (e.g., `en0`)
4. Set duration (max 30 seconds)
5. Click **Start Capture**

**Via CLI:**
```bash
# Capture 10 seconds of Wi-Fi traffic
node test-cli.js wireshark en0 10
```

The output is **CSV-formatted** with columns for timestamp, source IP, destination IP, protocol, and packet info. You can paste this into spreadsheets or analysis tools.

## Using the CLI Test Tool

A command-line test client is included (`test-cli.js`) — no Claude Desktop needed.

```bash
# List available tools
node test-cli.js list-tools

# Capture network traffic (default: interface=any, duration=5s)
node test-cli.js wireshark

# Capture on specific interface for 10 seconds
node test-cli.js wireshark en0 10

# Run a Splunk query (requires SPLUNK_API_TOKEN env var)
node test-cli.js splunk "index=_internal | head 5"

# Run a Splunk query with custom time range
node test-cli.js splunk "index=main | stats count by host" "-1h"
```

## Project Structure

```
.
├── server.ts          # Main MCP server source (stdio + HTTP transport)
├── test-cli.js        # CLI test client for stdio mode
├── public/
│   └── index.html     # Web UI dashboard for HTTP mode
├── dist/              # Compiled JavaScript output
├── package.json       # Project metadata and scripts
├── tsconfig.json      # TypeScript configuration
└── README.md          # This file
```

## Available Tools

### capture_wireshark_traffic

Captures live packets for a specified duration.

**Parameters:**
- `duration_seconds` (number, optional, default: `5`, max: `30`) — How long to capture
- `interface` (string, optional, default: `"any"`) — Network interface to sniff (e.g., `en0`, `eth0`, `any`)

**Returns:** CSV-formatted packet data with fields for time, source IP, destination IP, protocol, and info.

### query_local_splunk

Runs an SPL query against Splunk.

**Parameters:**
- `query` (string, required) — SPL query string
- `earliest_time` (string, optional, default: `"-15m"`) — Time modifier (e.g., `-15m`, `-1h`)

**Returns:** JSON-formatted Splunk search results.

## Notes

- **tshark permissions:** On macOS/Linux, you may need to run with `sudo` or configure Wireshark capture permissions for non-root users.
- **HTTP transport** uses the MCP Streamable HTTP specification with session management.
- **STDIO transport** is the standard for local MCP servers and is required for Claude Desktop integration.
