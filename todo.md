# TODO / ideas

## High priority

- [ ] Typed errors from OpenAPI responses
  - Generate typed error classes or discriminated unions for non-2xx responses.
  - Reuse response schemas from `responses[4xx|5xx].content.*.schema` when available.
  - Preserve status code, headers, raw body, parsed body, and response `description`.
  - Support multiple error shapes per endpoint, e.g. `400 | 401 | 404 | 422 | 500`.
  - Optionally expose a common base type like `ApiError<TBody = unknown>`.
  - Decide generator API:
    - throw typed errors;
    - or return `Result<TSuccess, TError>`-style wrappers;
    - or support both via flag.
  - For endpoints with `default` error response, map it as a fallback error type.
  - For text or empty error bodies, keep a typed fallback for raw text / no-content cases.

- [ ] Normalize runtime error handling
  - Replace `throw Response` with a stable generated error object/class.
  - Include parsed error payload when content type is JSON.
  - Keep original `Request` and `Response` references for debugging.

- [ ] Make generated clients compile-tested in CI
  - Generate a few fixtures and run `tsc --noEmit` against emitted clients.
  - Cover `--targetNode`, browser mode, `--enableScats`, and filtered schemas.

- [x] Fix async flow in CLI entrypoint
  - Make `main()` await and return the fetch/render pipeline.
  - Ensure process exits non-zero on network, parse, or file write failures.

## Generator quality

- [x] Encode path parameters safely
  - Apply `encodeURIComponent` to path substitutions, not only query params.

- [ ] Better response parsing strategy
  - [x] Handle `204 No Content` explicitly.
  - [x] Avoid relying only on `content-length`.
  - [x] Respect `content-type` more strictly for `json | text | bytes` parsing.
  - [ ] Align generated return types for no-content responses (e.g. `Promise<void>`).

- [ ] Stronger support for cookies and auth schemes
  - Generate cookie parameter handling.
  - Parse `securitySchemes` and generate helpers for bearer/basic/api-key auth.

- [ ] Better multipart typing in Node/browser targets
  - Document runtime deps for `--targetNode` more clearly.
  - Revisit `File` / `Blob` / `Buffer` handling across environments.

- [ ] Improve schema composition support
  - Audit `oneOf`, `allOf`, `anyOf`, discriminators, nullable combinations.
  - Prefer discriminated unions when OpenAPI provides enough metadata.

- [ ] Enum generation improvements
  - Consider `as const` objects or string union output mode.
  - Support numeric enums and mixed enum descriptions more ergonomically.

- [ ] Operation naming controls
  - Add flags/hooks to customize generated function names.
  - Detect collisions and generate clearer suffixes.

## Developer experience

- [ ] Add a strict mode for the generator codebase
  - Move toward stricter TypeScript settings.
  - Reduce implicit `any` and nullability ambiguity inside generator internals.

- [ ] Add snapshot-style tests for generated output
  - Keep small representative OpenAPI fixtures in `test/fixtures`.
  - Assert signatures, response types, request body types, and imports.

- [ ] Add unit tests for schema edge cases
  - Cover cases where request bodies, responses, and reusable schemas share common object parts.
  - Cover the same shared fragments reused in different contexts: request payload, response payload, nested body field, and inline object.
  - Cover `allOf` composition for “base + specialized” models used both in requests and responses.
  - Cover combinations of `$ref` + inline properties + arrays of shared objects.
  - Cover cases where the same logical object is represented differently in request vs response.
  - Assert not only generated text, but also resolved internal schema/method models where possible.

- [ ] Improve README for consumer runtime contracts
  - Clarify what `--targetNode` requires.
  - Document browser vs Node expectations.
  - Show how generated typed errors are intended to be handled once implemented.

- [ ] Add debug mode / diagnostics
  - Print why schemas were included/excluded.
  - Print unsupported mime types and skipped constructs.

## Nice-to-have

- [ ] Pluggable template strategy
  - Allow alternative templates/output styles without forking the project.

- [ ] Split generated runtime from generated API surface
  - Optionally emit shared runtime helpers once and lightweight per-spec clients separately.

- [ ] Generate zod/io-ts/valibot validators optionally
  - Useful for runtime validation of server responses and error payloads.

- [ ] Add OpenAPI source caching for local development
  - Cache downloaded specs to simplify repeated generator runs.

- [ ] Add compatibility matrix
  - Track which OpenAPI constructs are fully supported, partially supported, or unsupported.
