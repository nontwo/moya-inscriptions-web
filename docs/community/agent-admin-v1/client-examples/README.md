# Agent Administration V1 — inert client configuration examples

These examples contain no working credential and point at a loopback Development
Admin. Nothing here activates access: a principal exists only when the Owner
creates it in the operations view, and an MCP API key only works after the Owner
creates it, binds its operator identity to that principal (`agentPrincipal`) and
enables the `artvenn_*` tools on the key.

The Authorization header value is the scheme word the Payload MCP plugin expects
(`Bearer`), one space, and the MCP API key. Supply it through the client's own
secret storage in place of `REPLACE_WITH_AUTHORIZATION_HEADER`; never commit a
real key, never paste it into chat.

## Generic MCP client (streamable HTTP; the Payload MCP API key as a bearer token)

```json
{
  "$comment": "Inert example. No credential. Development Admin over loopback only.",
  "servers": {
    "artvenn-admin-development": {
      "type": "http",
      "url": "http://127.0.0.1:3001/api/mcp",
      "headers": {
        "Authorization": "REPLACE_WITH_AUTHORIZATION_HEADER"
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
        "Authorization": "REPLACE_WITH_AUTHORIZATION_HEADER"
      }
    }
  }
}
```
