# Agent Administration V1 — inert client configuration examples

These examples contain no working credential and point at a loopback Development
Admin. Nothing here activates access: a principal exists only when the Owner
creates it in the operations view, and an MCP API key only works after the Owner
creates it, binds its operator identity to that principal (`agentPrincipal`) and
enables the `artvenn_*` tools on the key.

Replace `REPLACE_WITH_API_KEY` by supplying the key through the client's own
secret storage; never commit a real key, never paste it into chat.

## Generic MCP client (streamable HTTP, bearer API key)

```json
{
  "$comment": "Inert example. No credential. Development Admin over loopback only.",
  "servers": {
    "artvenn-admin-development": {
      "type": "http",
      "url": "http://127.0.0.1:3001/api/mcp",
      "headers": {
        "Authorization": "users API-Key REPLACE_WITH_API_KEY"
      },
      "tools": [
        "artvenn_users_find",
        "artvenn_content_search",
        "artvenn_comments_query",
        "artvenn_comments_read",
        "artvenn_comments_prepare",
        "artvenn_featured_prepare",
        "artvenn_operations_execute",
        "artvenn_operations_get",
        "artvenn_operations_cancel",
        "artvenn_operations_prepare_undo"
      ]
    }
  }
}
```

## Claude Code `mcpServers`

```json
{
  "$comment": "Inert example for Claude Code's mcpServers. No credential; Development only.",
  "mcpServers": {
    "artvenn-admin-development": {
      "type": "http",
      "url": "http://127.0.0.1:3001/api/mcp",
      "headers": {
        "Authorization": "users API-Key REPLACE_WITH_API_KEY"
      }
    }
  }
}
```
