import {describe, expect, it} from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {HashSet} from 'scats';
import {Renderer} from '../src/renderer.js';
import {
  resolvePaths,
  resolveSchemas,
  resolveSchemasTypes
} from '../src/components-parse.js';
import {GenerationOptions} from '../src/schemas.js';

const options: GenerationOptions = {
  referencedObjectsNullableByDefault: false,
  includeTags: HashSet.from<string>([]),
  excludeTags: HashSet.from<string>([]),
  onlyUsedSchemas: false,
  includeSchemasByMask: HashSet.from<string>([])
};

describe('Renderer', () => {
  it('renders schemas and methods to file using templates', async () => {
    const spec = {
      components: {
        schemas: {
          Pet: {
            title: 'Pet',
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' }
            }
          },
          Status: {
            title: 'Status',
            type: 'string',
            enum: ['NEW', 'OLD']
          }
        }
      },
      paths: {
        '/pets': {
          get: {
            tags: ['public'],
            operationId: 'listPets',
            responses: {
              200: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Pet' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    };

    const types = resolveSchemasTypes(spec);
    const schemasMap = resolveSchemas(spec, types, options);
    const methods = resolvePaths(spec, types, options, schemasMap);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'renderer-'));
    const targetFile = path.join(tmpDir, 'client.ts');

    const renderer = new Renderer();
    await renderer.renderToFile(schemasMap.values, methods, false, false, targetFile);

    const output = fs.readFileSync(targetFile, 'utf8');
    expect(output).toContain('export interface Pet');
    expect(output).toContain('export enum Status');
    expect(output).toContain('async function listPets');
  });

  it('wraps scats unknown responses to Option at runtime', async () => {
    const spec = {
      components: {
        schemas: {}
      },
      paths: {
        '/edo/message': {
          get: {
            operationId: 'edo_message',
            responses: {
              200: {
                description: 'ok',
                content: {
                  'application/json': {}
                }
              }
            }
          }
        }
      }
    };

    const types = resolveSchemasTypes(spec);
    const schemasMap = resolveSchemas(spec, types, options);
    const methods = resolvePaths(spec, types, options, schemasMap);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'renderer-'));
    const targetFile = path.join(tmpDir, 'client.ts');

    const renderer = new Renderer();
    await renderer.renderToFile(schemasMap.values, methods, true, false, targetFile);

    const output = fs.readFileSync(targetFile, 'utf8');
    expect(output).toContain('Promise<TryLike<Option<any>>>');
    expect(output).toContain('.map(res => option(res))');
  });

  it('escapes reserved property names in scats DTO fields', async () => {
    const spec = {
      components: {
        schemas: {
          KeywordDto: {
            type: 'object',
            properties: {
              function: { type: 'string' }
            },
            required: ['function']
          }
        }
      },
      paths: {}
    };

    const types = resolveSchemasTypes(spec);
    const schemasMap = resolveSchemas(spec, types, options);
    const methods = resolvePaths(spec, types, options, schemasMap);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'renderer-'));
    const targetFile = path.join(tmpDir, 'client.ts');

    const renderer = new Renderer();
    await renderer.renderToFile(schemasMap.values, methods, true, false, targetFile);

    const output = fs.readFileSync(targetFile, 'utf8');
    expect(output).toContain('readonly $function: string,');
    expect(output).toContain('json[\'function\']');
  });

  it('disambiguates collisions after identifier escaping', async () => {
    const spec = {
      components: {
        schemas: {
          KeywordCollisionDto: {
            type: 'object',
            properties: {
              function: { type: 'string' },
              $function: { type: 'string' }
            },
            required: ['function', '$function']
          }
        }
      },
      paths: {}
    };

    const types = resolveSchemasTypes(spec);
    const schemasMap = resolveSchemas(spec, types, options);
    const methods = resolvePaths(spec, types, options, schemasMap);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'renderer-'));
    const targetFile = path.join(tmpDir, 'client.ts');

    const renderer = new Renderer();
    await renderer.renderToFile(schemasMap.values, methods, true, false, targetFile);

    const output = fs.readFileSync(targetFile, 'utf8');
    expect(output).toContain('readonly $function: string,');
    expect(output).toContain('readonly $function_1: string,');
  });

  it('escapes reserved parameter names in method signatures', async () => {
    const spec = {
      components: {
        schemas: {}
      },
      paths: {
        '/keywords': {
          get: {
            operationId: 'getKeywords',
            parameters: [
              {
                in: 'query',
                name: 'function',
                required: true,
                schema: { type: 'string' }
              }
            ],
            responses: {
              200: {
                content: {
                  'application/json': {
                    schema: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    };

    const types = resolveSchemasTypes(spec);
    const schemasMap = resolveSchemas(spec, types, options);
    const methods = resolvePaths(spec, types, options, schemasMap);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'renderer-'));
    const targetFile = path.join(tmpDir, 'client.ts');

    const renderer = new Renderer();
    await renderer.renderToFile(schemasMap.values, methods, false, false, targetFile);

    const output = fs.readFileSync(targetFile, 'utf8');
    expect(output).toContain('export async function getKeywords(');
    expect(output).toContain('$function: string,');
    expect(output).toContain('queryParams.push(`function=${encodeURIComponent($function)}`);');
  });
});
