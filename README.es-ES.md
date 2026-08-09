# codei

**Reduce tus costos de codificación con IA en un 95%. Índice de código sin vectores para recuperación inteligente de contexto.**

> Cada vez que pegas tu base de código en ChatGPT o Claude, estás quemando tokens. `codei` le da a la IA exactamente el contexto que necesita — nada más.

> Nota de marca: `codei` es el nuevo nombre del producto para `Codeindex`. La `i` representa tanto `índice` como recuperación de contexto `inteligente`. El comando CLI es `codei`, el paquete npm es `pnftrading_codei`, y los paquetes núcleo/adaptador se publican bajo `pnftrading_codei-*`.
> Paquete npm: https://www.npmjs.com/package/pnftrading_codei
> Versión npm actual: `pnftrading_codei@0.1.2`

![Licencia: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat\&logo=typescript\&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat\&logo=nodedotjs\&logoColor=white)

***

## El Problema

Estás pagando **$20-100/mes** por herramientas de codificación con IA, pero aquí está el secreto sucio:

| Lo Que Estás Haciendo              | Lo Que Cuesta               |
| ---------------------------------- | --------------------------- |
| Pegar archivos completos en ChatGPT | ~50,000 tokens/consulta     |
| Claude analizando tu base de código | $0.03-0.15/consulta         |
| Errores de desbordamiento de ventana de contexto | Frustración incalculable |

**El desarrollador promedio desperdicia el 80% de su presupuesto de IA en contexto irrelevante.**

Cada `CTRL+C → CTRL+V` a un chat de IA quema tokens en código que no tiene nada que ver con tu pregunta. Estás pagando por una sopa de contexto cuando solo necesitas un ingrediente.

***

## La Solución

`codei` convierte tu repositorio en un mapa compacto y consultable que las herramientas de IA pueden usar bajo demanda. En lugar de pedirle a un asistente que inspeccione cada archivo, construyes un índice local una vez y dejas que `codei` recupere los pocos módulos, archivos, símbolos y firmas de dependencia que importan para la pregunta actual.

El flujo de trabajo es deliberadamente simple:

1. `codei index .` escanea el proyecto, respeta tus reglas de ignorencia, analiza los idiomas soportados y almacena un árbol local `.index/`.
2. `codei query "<tu pregunta>"` usa el índice para encontrar las partes relevantes de la base de código.
3. La salida ya está formateada para un chat de IA o agente de codificación, incluyendo fragmentos de código seleccionados más contexto ligero de dependencias.
4. Después de cambios en el código, `codei update` actualiza el índice incrementalmente para que las consultas futuras estén actualizadas.

Esto hace que `codei` sea útil como capa de contexto para Codex, Claude Code, Cursor, Windsurf, Cline, Antigravity, y cualquier agente que pueda ejecutar comandos shell o llamar al servidor HTTP local. El agente pregunta a `codei` primero, luego trabaja con contexto específico en lugar de adivinar qué archivos abrir.

**Resultado: ~1,000-3,000 tokens por consulta en lugar de 50,000+**

```
Antes: Pega 200 archivos (50KB) → Pregunta "arregla mi error de inicio de sesión"
Después: Consulta codei, pega 3 archivos enfocados (2KB) → Misma respuesta
```

***

## ¿Por qué codei?

| <br />           | codei         | Embeddings Vectoriales    | Copiar y Pegar Manual    |
| ---------------- | ------------- | ------------------------- | ------------------------ |
| **Tokens/consulta** | ~2 KB         | ~100 KB                   | 50+ KB                   |
| **Configuración**   | 2 minutos     | 30 minutos                | 0                        |
| **Precisión**       | Razonamiento LLM | Similitud coseno       | Estás adivinando         |
| **Actualizaciones** | Instantáneas  | Re-embedir toda la base de código | Manual                    |
| **Privacidad**      | Índice local; llamada al proveedor solo cuando se configura | Los datos abandonan la máquina | Tú eliges qué pegar       |
| **Costo**           | Gratis (MIT)  | $20-100/mes               | Gratis (desperdioso)     |

***

## Características

- **Arquitectura Sin Vectores** — Sin embeddings, sin almacenamiento externo, sin costos recurrentes
- **Razonamiento LLM** — Pregunta "¿qué código es relevante?" en lugar de "¿qué código es similar?"
- **Multi-Idioma** — TypeScript, Python, Go, Rust, Java, C#, C++, PHP, Swift
- **Actualizaciones Incrementales** — Solo re-índice los archivos modificados
- **Integración IDE** — API HTTP para VSCode, JetBrains, Neovim, Claude Code, Cursor
- **Preparado para Git Hooks** — Actualización automática del índice después de commits
- **Listo para Producción** — Autenticación con API key, limitación de velocidad, logging estructurado

***

## Inicio Rápido

```bash
# 1. Instalar
npm install -g pnftrading_codei

# 2. Configurar una vez globalmente
codei setup

# 3. Inicializar tu proyecto y generar reglas para agentes de IA
cd tu-proyecto
codei init --agent all

# 4. Construir el índice
codei index .

# 5. ¡Consultar!
codei query "¿Cómo funciona el módulo de autenticación?"
```

El paquete npm instala ambos alias de comandos: `codei` y `codeindex`. `codei init --agent all` crea `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`, y `.antigravity/rules.md` cuando no existen ya.

La configuración global se almacena en `~/.codei/` y se reutiliza para todos los proyectos futuros.

Si prefieres configuración basada en variables de entorno, `codei setup` también escribe `~/.codei/.env`.

Para NVIDIA, un entorno global mínimo se ve así:

```env
NVIDIA_API_KEY=nvapi-...
CODEI_BASE_URL=https://integrate.api.nvidia.com/v1
```

**Eso es todo.** Ejecuta la configuración una vez, luego `codei index` funciona en todos los proyectos.

***

## Cómo Funciona

```
┌─────────────────────────────────────────────────────────────┐
│                       Tu Consulta                           │
│             "¿Cómo funciona la validación de autenticación?"│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Índice de codei                         │
│                                                             │
│   Proyecto                                                  │
│   └── src/                                                  │
│       ├── auth/               ← LLM selecciona este módulo  │
│       │   ├── login.ts        ← Y estos archivos           │
│       │   └── validators.ts                                    │
│       └── users/                                              │
│           └── ...                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Respuesta                            │
│                                                             │
│   auth/validators.ts + auth/login.ts (2KB)                  │
│   "Aquí están las funciones de validación..."                │
└─────────────────────────────────────────────────────────────┘
```

***

## Ahorro de Tokens

| Tamaño del Proyecto | Antes            | Después          | Ahorras              |
| ------------------- | ---------------- | ---------------- | -------------------- |
| 50 archivos         | 15,000 tokens    | 800 tokens       | **$0.05/consulta**   |
| 200 archivos        | 60,000 tokens    | 1,500 tokens     | **$0.15/consulta**   |
| 500+ archivos       | Desbordamiento de contexto | 2,500 tokens | **Incalculable**      |

Con 10 consultas/día, eso son **$15-45/mes** ahorrados.

***

## Integraciones IDE

La integración más sencilla ahora es generada por `codei init --agent all`. Añade archivos de reglas a nivel de proyecto que indican a los agentes IDE que ejecuten `codei query` antes de responder preguntas sobre la base de código o editar código.

Ver la guía completa en inglés: [docs/IDE-INTEGRATION.md](./docs/IDE-INTEGRATION.md).

Regla rápida para Codex, Claude Code, Cursor, Windsurf, Cline, Antigravity, y otros IDEs de IA similares:

```markdown
Antes de analizar o editar este repositorio, ejecuta:

codei query "<pregunta específica de la tarea>"

Usa la salida como contexto principal de código. Después de las ediciones, ejecuta `codei update`.
```

***

## Idiomas Soportados

TypeScript • Python • Go • Rust • Java • C# • C++ • PHP • Swift

*El soporte multi-idioma está integrado. Cada idioma es manejado por su propio adaptador dedicado.*

***

## Pruebas

Ejecuta todas las pruebas en el espacio de trabajo:

```bash
pnpm test          # Ejecutar todas las pruebas
pnpm test:watch    # Ejecutar en modo observación
```

## Publicación

```bash
pnpm changeset
pnpm run version-packages
pnpm run release:check
pnpm run release:publish:dry-run
```

Ver [docs/RELEASING.md](./docs/RELEASING.md) para el flujo de trabajo completo de publicación npm.

***

## Arquitectura

```
codei/
├── packages/
│   ├── core/                    # Índice de árbol, recuperación, almacenamiento
│   ├── cli/                     # CLI y servidor HTTP
│   └── adapter-*/              # Analizadores específicos por idioma
└── docs/                        # Documentación
```

El índice y el servidor HTTP corren localmente. Por defecto, los resúmenes semánticos y el razonamiento de consultas usan tu proveedor LLM configurado; usa `ollama` para una ruta completamente local.

***

## Contribuir

¡Contribuciones bienvenidas! Ver [docs/](./docs/) para detalles de arquitectura.

## Licencia

MIT — Úsalo libremente, incluso en proyectos comerciales.

## Soporte

Si codei te ahorra tiempo y dinero, considera comprarme un café ☕

[![Donar con PayPal](https://img.shields.io/badge/PayPal-zorrong@outlook.com-003087?style=for-the-badge\&logo=paypal)](https://paypal.me/zorrong)

***

**Deja de pagar por contexto que no necesitas. Empieza a usar codei.**
