# Model Context Protocol - librarycomponents

Este proyecto expone un servidor MCP utilizando el archivo `main.ts` como entrypoint.

## Uso local

1. **Instalación de dependencias**
   ```bash
   npm install
   ```

2. **Ejecutar el servidor MCP en local**
   ```bash
   npx -y @modelcontextprotocol/inspector npx -y tsx main.ts
   ```

## Configuración para integración

En tu configuración MCP, puedes definir el servidor así:

```jsonc
"mcp": {
  "servers": {
    "librarycomponents": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "link"
      ],
      "env": {
        "GITHUB_TOKEN": "",
        "GITHUB_REPO_OWNER": "",
        "GITHUB_REPO_NAME": "",
        "GITHUB_BRANCH": ""
      }
    }
  }
}
