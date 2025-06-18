import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN as string;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER as string;
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME as string;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH as string;

const server = new McpServer({
  name: "edmachina-components",
  version: "1.0.0",
  description: "Proporciona contexto y documentacion sobre los componentes de Edmachina.",
});

type TreeNode = { [key: string]: TreeNode | null };

const getOctokit = (): Octokit => new Octokit({ auth: GITHUB_TOKEN });

const getBranchInfo = async (octokit: Octokit) => {
  return await octokit.repos.getBranch({
    owner: GITHUB_REPO_OWNER,
    repo: GITHUB_REPO_NAME,
    branch: GITHUB_BRANCH,
  });
};

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = {};
  for (const path of paths) {
    const parts = path.split('/');
    let node: TreeNode = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      if (i === parts.length - 1) {
        node[part] = null;
      } else {
        node[part] = node[part] || {};
        node = node[part] as TreeNode;
      }
    }
  }
  return root;
}

function renderTree(node: TreeNode, prefix = '', isLast = true): string {
  const entries = Object.entries(node).sort(([a], [b]) => a.localeCompare(b, 'es'));
  let result = '';
  entries.forEach(([name, child], idx) => {
    const last = idx === entries.length - 1;
    const connector = last ? '└── ' : '├── ';
    const nextPrefix = prefix + (isLast ? '    ' : '│   ');
    if (child === null) {
      if (name.endsWith('.md')) {
        result += `${prefix}${connector}${name} 🧩\n`;
      }
    } else {
      result += `${prefix}${connector}${name}/ 📁\n`;
      result += renderTree(child, nextPrefix, last);
    }
  });
  return result;
}

server.tool(
  "get_documentation",
  `Devuelve la lista de carpetas y archivos dentro de /src/documentation en formato de lista ordenada y decorada con los siguientes iconos:\n\n- Usa 🗂️ para cada carpeta.\n- Usa ⚛️ para cada archivo Markdown (.md) de documentación. Ejemplo:
  components/ 📁
  ├── buttons/ 📁
  │ ├── button_default.md 🧩
  │ ├── button_icon.md 🧩
  │ └── button_group.md 🧩
  ├── forms/ 📁
  │ ├── input_text.md 🧩
  │ ├── checkbox_toggle.md 🧩
  │ └── select_dropdown.md 🧩
  ├── layout/ 📁
  │ ├── header_main.md 🧩
  │ ├── footer_simple.md 🧩
  │ └── sidebar_collapsible.md 🧩
  ├── feedback/ 📁
  │ ├── alert_success.md 🧩
  │ ├── toast_notification.md 🧩
  │ └── loading_spinner.md 🧩
  └── data/ 📁
  ├── data_table.md 🧩
  ├── user_card.md 🧩
  └── chart_line.md 🧩
  \n  IMPORTANTE: No resumas, no reordenes, no elimines ni alteres ninguna sección, línea, formato, ni caracteres del archivo.\n  Muestra absolutamente todo el contenido tal como está en el archivo original, desde la primera hasta la última línea, incluyendo encabezados, tablas, ejemplos de código, comentarios, advertencias, notas y cualquier otro elemento.\n  NO MUESTRES CARPETAS QUE NO SEAN DE /src/documentation, ni archivos que no sean .md.\n  `,
  {
    recursive: z.boolean().optional().describe("Si es verdadero, devuelve los objetos o subárboles referenciados por el árbol especificado de forma recursiva."),
  },
  async ({ recursive }) => {
    if (!GITHUB_TOKEN) {
      return {
        content: [{ type: "text", text: "Error: GITHUB_TOKEN no está configurado en las variables de entorno." }],
        isError: true,
      };
    }
    try {
      const octokit = getOctokit();
      let branchInfo;
      try {
        branchInfo = await getBranchInfo(octokit);
      } catch (err) {
        let msg = `No se encontró el repo o la rama: https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME} branch: ${GITHUB_BRANCH}`;
        if (err && typeof err === 'object' && 'message' in err) {
          msg += `\nDetalles: ${(err as any).message}`;
        }
        if (err && typeof err === 'object' && 'status' in err) {
          msg += `\nStatus: ${(err as any).status}`;
        }
        if (err && typeof err === 'object' && 'response' in err && (err as any).response && 'data' in (err as any).response) {
          msg += `\nDatos: ${JSON.stringify((err as any).response.data)}`;
        }
        return {
          content: [{ type: "text", text: msg }],
          isError: true,
        };
      }
      const treeSha = branchInfo.data.commit.commit.tree.sha;
      const response = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_REPO_NAME,
        tree_sha: treeSha,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
        recursive: recursive ? '1' : undefined
      });
      if (response.data && Array.isArray(response.data.tree)) {
        const docPaths = response.data.tree
          .filter((item: any) => item.path.startsWith('src/documentation/'))
          .map((item: any) => item.path.replace('src/documentation/', ''));
        let tree = buildTree(docPaths);
        let output = 'documentation/ 📁\n';
        output += renderTree(tree, '', true);
        output = output.replace(/\n$/, '');
        return {
          content: [{ type: "text", text: output }],
        };
      } else {
        return {
          content: [{ type: "text", text: `No se encontraron archivos en src/ o la respuesta no es válida.` }],
          isError: true,
        };
      }
    } catch (error) {
      let errorMessage = 'Error al listar la documentación de GitHub:';
      if (error && typeof error === 'object') {
        if ('message' in error) errorMessage += ` ${(error as any).message}`;
        if ('status' in error) errorMessage += `\nEstado: ${(error as any).status}`;
        if ('response' in error && (error as any).response && 'data' in (error as any).response) {
          errorMessage += `\nDatos: ${JSON.stringify((error as any).response.data)}`;
        }
      }
      return {
        content: [{ type: "text", text: errorMessage }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_doc_by_name",
  `Devuelve el contenido completo y sin modificar del archivo Markdown de documentación del componente solicitado.

No resumas, no reordenes, no elimines ni alteres ninguna sección, línea, formato, ni caracteres del archivo.
Muestra absolutamente todo el contenido tal como está en el archivo original, desde la primera hasta la última línea, incluyendo encabezados, tablas, ejemplos de código, comentarios, advertencias, notas y cualquier otro elemento.
No agregues explicaciones, comentarios adicionales ni resumas el contenido.
Si hay varias coincidencias, muestra la lista de rutas relativas de los archivos encontrados, pero nunca mezcles ni modifiques el contenido de los archivos.
Si no se encuentra documentación, responde exactamente: "No se encontró documentación para '<nombre_del_componente>'."
El objetivo es que el usuario reciba el archivo Markdown tal cual está en el repositorio, sin ninguna alteración.`,
  {
    name: z.string().describe("Nombre del componente a buscar (ej: button, card_stats, input_default, etc.)")
  },
  async ({ name }) => {
    if (!GITHUB_TOKEN) {
      return {
        content: [{ type: "text", text: "Error: GITHUB_TOKEN no está configurado en las variables de entorno." }],
        isError: true,
      };
    }
    try {
      const octokit = getOctokit();
      let branchInfo;
      try {
        branchInfo = await getBranchInfo(octokit);
      } catch (err) {
        let msg = `No se encontró el repo o la rama: https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME} branch: ${GITHUB_BRANCH}`;
        if (err && typeof err === 'object' && 'message' in err) {
          msg += `\nDetalles: ${(err as any).message}`;
        }
        return {
          content: [{ type: "text", text: msg }],
          isError: true,
        };
      }
      const treeSha = branchInfo.data.commit.commit.tree.sha;
      const response = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{tree_sha}', {
        owner: GITHUB_REPO_OWNER,
        repo: GITHUB_REPO_NAME,
        tree_sha: treeSha,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
        recursive: '1'
      });
      if (response.data && Array.isArray(response.data.tree)) {
        const mdFiles = response.data.tree.filter((item: any) =>
          item.path.startsWith('src/documentation/') && item.path.endsWith('.md')
        );
        const matches = mdFiles.filter((item: any) => {
          const relPath = item.path.replace('src/documentation/', '');
          const parts = relPath.split('/');
          const fileName = parts[parts.length - 1].replace('.md', '').toLowerCase();
          const folderName = parts.length > 1 ? parts[0].toLowerCase() : '';
          return fileName.includes(name.toLowerCase()) || folderName.includes(name.toLowerCase());
        });
        if (matches.length === 0) {
          return {
            content: [{ type: "text", text: `No se encontró documentación para '${name}'.` }],
            isError: true,
          };
        }
        if (matches.length === 1) {
          const file = matches[0];
          const relPath = file.path.replace('src/documentation/', '');
          const fileResp = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
            owner: GITHUB_REPO_OWNER,
            repo: GITHUB_REPO_NAME,
            path: file.path,
            ref: GITHUB_BRANCH
          });
          let content = '';
          if (
            fileResp.data &&
            typeof fileResp.data === 'object' &&
            'content' in fileResp.data &&
            typeof (fileResp.data as any).content === 'string'
          ) {
            content = Buffer.from((fileResp.data as any).content, 'base64').toString('utf-8');
          }
          return {
            content: [
              { type: "text", text: `# ${relPath}\n\n${content}` }
            ]
          };
        } else {
          const list = matches.map((item: any) => {
            const relPath = item.path.replace('src/documentation/', '');
            return `- ${relPath}`;
          }).join('\n');
          return {
            content: [{ type: "text", text: `Se encontraron varias coincidencias para '${name}':\n${list}` }]
          };
        }
      } else {
        return {
          content: [{ type: "text", text: `No se encontraron archivos en src/documentation/ o la respuesta no es válida.` }],
          isError: true,
        };
      }
    } catch (error) {
      let errorMessage = 'Error al buscar la documentación:';
      if (error && typeof error === 'object' && 'message' in error) {
        errorMessage += ` ${(error as any).message}`;
      }
      return {
        content: [{ type: "text", text: errorMessage }],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);