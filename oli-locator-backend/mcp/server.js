#!/usr/bin/env node
/**
 * Oli-Locator MCP Server
 * Exposes lead search, gov contracts, and funded startups as MCP tools
 * that AI agents (Claude, ChatGPT, etc.) can use.
 * 
 * Run: node mcp/server.js
 * Connect: configure in Claude Desktop / any MCP client
 */

import { filterLeads } from "../server/leadSearch.js";
import { searchGovContracts } from "../server/govContracts.js";
import { searchFundedStartups } from "../server/fundedStartups.js";
import { generateOutreach } from "../server/aiOutreach.js";
import { createInterface } from "node:readline";

const TOOLS = [
  {
    name: "search_leads",
    description: "Search for client leads (companies hiring freelancers) by country and skill category. Sources: Adzuna (USA/UK/AU), Remotive + Jobicy (global remote).",
    inputSchema: {
      type: "object",
      properties: {
        country: { type: "string", description: "Country code: US, UK, AU, or REMOTE", default: "US" },
        trade: { type: "string", description: "Skill category: web-development, mobile-development, ui-ux-design, digital-marketing, content-writing, video-animation, virtual-assistant, data-entry, accounting, sales, customer-support" },
        city: { type: "string", description: "City or location to search (optional)" },
        pageSize: { type: "number", description: "Number of results (default 10, max 50)", default: 10 }
      },
      required: ["country"]
    }
  },
  {
    name: "search_gov_contracts",
    description: "Search government contracts and tenders from official APIs. Sources: SAM.gov (USA), UK Contracts Finder, AusTender (AU), EU TED.",
    inputSchema: {
      type: "object",
      properties: {
        country: { type: "string", description: "Country: US, UK, AU, EU, or ALL", default: "ALL" },
        keyword: { type: "string", description: "Search keyword (e.g., 'IT', 'web development', 'cleaning')" },
        pageSize: { type: "number", description: "Number of results (default 10, max 50)", default: 10 }
      },
      required: ["keyword"]
    }
  },
  {
    name: "search_funded_startups",
    description: "Find recently funded startups and companies actively hiring. Sources: SEC EDGAR Form D filings, Hacker News hiring posts, Show HN launches.",
    inputSchema: {
      type: "object",
      properties: {
        keyword: { type: "string", description: "Search keyword (e.g., 'AI', 'fintech', 'SaaS')" },
        pageSize: { type: "number", description: "Number of results (default 10, max 50)", default: 10 }
      },
      required: ["keyword"]
    }
  },
  {
    name: "generate_outreach",
    description: "Generate a personalized cold email, LinkedIn message, and WhatsApp message for a specific lead using AI.",
    inputSchema: {
      type: "object",
      properties: {
        leadTitle: { type: "string", description: "The job/lead title" },
        leadCompany: { type: "string", description: "The company name" },
        leadDescription: { type: "string", description: "Description of the job/opportunity" },
        userBusinessName: { type: "string", description: "Your business name" },
        userSkill: { type: "string", description: "Your primary skill/service" }
      },
      required: ["leadTitle", "leadCompany"]
    }
  }
];

// JSON-RPC 2.0 handler
async function handleRequest(request) {
  const { method, params, id } = request;

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "oli-locator-mcp", version: "1.0.0" }
        }
      };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS }
      };

    case "tools/call":
      return await handleToolCall(params, id);

    case "notifications/initialized":
      return null; // No response needed for notifications

    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` }
      };
  }
}

async function handleToolCall(params, id) {
  const { name, arguments: args } = params;

  try {
    let result;
    switch (name) {
      case "search_leads":
        result = await filterLeads({
          country: args.country || "US",
          trade: args.trade || "",
          city: args.city || "",
          page: 1,
          pageSize: Math.min(args.pageSize || 10, 50)
        });
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result.leads?.slice(0, 10) || [], null, 2) }] } };

      case "search_gov_contracts":
        result = await searchGovContracts({
          country: args.country || "ALL",
          keyword: args.keyword || "",
          page: 1,
          pageSize: Math.min(args.pageSize || 10, 50)
        });
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result.contracts?.slice(0, 10) || [], null, 2) }] } };

      case "search_funded_startups":
        result = await searchFundedStartups({
          keyword: args.keyword || "startup",
          page: 1,
          pageSize: Math.min(args.pageSize || 10, 50)
        });
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result.startups?.slice(0, 10) || [], null, 2) }] } };

      case "generate_outreach":
        result = await generateOutreach({
          leadTitle: args.leadTitle || "",
          leadCompany: args.leadCompany || "",
          leadDescription: args.leadDescription || "",
          userBusinessName: args.userBusinessName || "",
          userSkill: args.userSkill || ""
        });
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } };

      default:
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown tool: ${name}` } };
    }
  } catch (err) {
    return { jsonrpc: "2.0", id, error: { code: -32000, message: err.message } };
  }
}

// Stdio transport (reads JSON-RPC from stdin, writes to stdout)
const rl = createInterface({ input: process.stdin });

rl.on("line", async (line) => {
  try {
    const request = JSON.parse(line);
    const response = await handleRequest(request);
    if (response) {
      process.stdout.write(JSON.stringify(response) + "\n");
    }
  } catch (err) {
    const errorResponse = {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error: " + err.message }
    };
    process.stdout.write(JSON.stringify(errorResponse) + "\n");
  }
});

process.stderr.write("Oli-Locator MCP Server running (stdio transport)\n");
