# Profiles for generated client

You can select the generated client runtime profile with the `--target` option.

Default is `browser`.

Multipart request body generation can be configured with the `--multipart-impl` option.

Binary response generation can be configured with the `--binary-response` option.

## Profile contract

Target profiles are compatibility contracts, not auto-polyfill modes.

Generated clients assume that the consuming application provides the runtime APIs, TypeScript types, and dependencies required by the selected profile. The generator does not try to support every possible Fetch, FormData, module, or Node.js version combination.

If an application uses older runtimes or different implementations, the application must provide compatible globals, install the documented dependencies, or use `RequestOptions.requestExecutor` where request execution needs to be customized.

## Available profiles

- [`browser`](#browser)
- [`node18`](#node18)
- [`node-fetch3`](#node-fetch3)

## Compatibility matrix

| Profile | Runtime | Fetch API | Multipart API | Binary responses | Module format | Extra dependencies |
| --- | --- | --- | --- | --- | --- | --- |
| `browser` | Modern browsers and browser-like runtimes | Web Fetch globals | `global` only | `arraybuffer` only | ESM | none |
| `node18` | Node.js 18+ | Node Web Fetch globals | `global` by default; `form-data` optional | `arraybuffer` by default; `buffer` optional | ESM | none by default; `form-data` only when selected; Node.js types when `buffer` is selected |
| `node-fetch3` | Node.js ESM applications that need explicit fetch imports | `node-fetch@3` | `form-data` by default; `global` optional | `buffer` by default; `arraybuffer` optional | ESM | `node-fetch`; `form-data` only when selected; Node.js types when `buffer` is selected |

## Multipart implementation

Use `--multipart-impl` to select how generated clients construct `multipart/form-data` request bodies.

Available values:

- `global`
- `form-data`

Defaults:

| Target profile | Default multipart implementation | Supported overrides |
| --- | --- | --- |
| `browser` | `global` | none |
| `node18` | `global` | `form-data` |
| `node-fetch3` | `form-data` | `global` |

### `global`

Uses the runtime `FormData`, `File`, and `Blob` globals.

This is the default for `browser` and `node18`.

Generated clients do not import a FormData package in this mode.

Consumers must provide Web-compatible `FormData`, `File`, and `Blob` APIs when generated clients include `multipart/form-data` operations.

### `form-data`

Uses the `form-data` package.

This mode is available only for Node target profiles. It is the default for `node-fetch3`.

Generated clients import `FormData` from `form-data` in this mode. Consumers must install `form-data` when generated clients include `multipart/form-data` operations.

Generated clients do not require `File` or `Blob` runtime globals in this mode.

## Binary responses

Use `--binary-response` to select the return type for binary response bodies.

Available values:

- `arraybuffer`
- `buffer`

Defaults:

| Target profile | Default binary response | Supported overrides |
| --- | --- | --- |
| `browser` | `arraybuffer` | none |
| `node18` | `arraybuffer` | `buffer` |
| `node-fetch3` | `buffer` | `arraybuffer` |

### `arraybuffer`

Returns binary responses as `ArrayBuffer`.

This is the default for `browser` and `node18`.

Generated clients read binary payloads with `response.arrayBuffer()` and do not import Node.js `Buffer`.

### `buffer`

Returns binary responses as `Buffer`.

This mode is available only for Node target profiles. It is the default for `node-fetch3`.

Generated clients convert binary payloads with `Buffer.from(await response.arrayBuffer())`. Consumers should provide Node.js types in TypeScript projects.

## Unsupported combinations

The initial profile set intentionally supports a narrow compatibility matrix.

Unsupported combinations:

- `--target browser --multipart-impl form-data`
- `--target browser --binary-response buffer`
- `node-fetch@2`
- CommonJS `node-fetch` profiles
- Node.js versions older than 18 for the `node18` profile

## `browser`

For browser applications and browser-like runtimes that provide the standard Web Fetch API.

Generated clients use runtime globals:

- `fetch`
- `Request`
- `Response`
- `FormData`
- `File`
- `Blob`
- `AbortSignal`
- `TextDecoder`

Binary responses are returned as `ArrayBuffer`.

This profile does not generate fetch or FormData imports. TypeScript consumers should compile with DOM-compatible library types.

This profile always uses `--multipart-impl global`.

This profile always uses `--binary-response arraybuffer`.

## `node18`

For Node.js 18+ applications using the native Fetch API provided by Node.

Generated clients use runtime globals:

- `fetch`
- `Request`
- `Response`
- `FormData`
- `File`
- `Blob`
- `AbortSignal`
- `TextDecoder`

Binary responses are returned as `ArrayBuffer`.

This profile does not import `node-fetch` or `form-data` by default.

`multipart/form-data` requests use `--multipart-impl global` by default. Use `--multipart-impl form-data` if the consuming application needs the `form-data` package instead of Node's Web `FormData` implementation.

Binary responses use `--binary-response arraybuffer` by default. Use `--binary-response buffer` if the consuming application needs Node.js `Buffer` responses.

TypeScript consumers should use a configuration that provides the required fetch globals. Depending on the project setup, this may come from the selected TypeScript version, `@types/node`, DOM-compatible library types, or a combination of them.

## `node-fetch3`

For Node.js applications that need explicit `node-fetch` imports instead of runtime globals.

Generated clients use:

- `node-fetch@3`
- ESM imports
- `Request` and `Response` from `node-fetch`
- a FormData implementation selected by `--multipart-impl`

Binary responses are returned as `Buffer`.

Consumers must install:

- `node-fetch`
- `form-data` if `--multipart-impl form-data` is selected and multipart requests are generated
- Node.js types if `Buffer` is used in TypeScript projects

`multipart/form-data` requests use `--multipart-impl form-data` by default. Use `--multipart-impl global` if the consuming application provides Web-compatible `FormData`, `File`, and `Blob` globals.

Binary responses use `--binary-response buffer` by default. Use `--binary-response arraybuffer` if the consuming application needs Web-compatible binary responses.

## Legacy targets

`node-fetch@2` is not planned as a first-class profile initially.

It has different module and type behavior from `node-fetch@3`, and supporting it would require a separate compatibility contract for imports, request body types, and multipart form data.
