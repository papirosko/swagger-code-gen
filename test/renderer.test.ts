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


  it('renders shared-object allOf models with shared array fields', async () => {
    const spec = {
      components: {
        schemas: {
          BaseEntity: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string' }
            }
          },
          SharedTag: {
            type: 'object',
            required: ['label'],
            properties: {
              label: { type: 'string' }
            }
          },
          CreateWidgetRequest: {
            allOf: [
              { $ref: '#/components/schemas/BaseEntity' },
              {
                type: 'object',
                required: ['primaryTag', 'related'],
                properties: {
                  primaryTag: { $ref: '#/components/schemas/SharedTag' },
                  related: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/SharedTag' }
                  }
                }
              }
            ]
          },
          WidgetResponse: {
            allOf: [
              { $ref: '#/components/schemas/BaseEntity' },
              {
                type: 'object',
                required: ['primaryTag', 'related', 'status'],
                properties: {
                  primaryTag: { $ref: '#/components/schemas/SharedTag' },
                  related: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/SharedTag' }
                  },
                  status: { type: 'string' }
                }
              }
            ]
          }
        }
      },
      paths: {
        '/widgets': {
          post: {
            operationId: 'createWidget',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateWidgetRequest' }
                }
              }
            },
            responses: {
              200: {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/WidgetResponse' }
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
    expect(output).toContain('export interface CreateWidgetRequest extends BaseEntity');
    expect(output).toContain('readonly \'primaryTag\': SharedTag;');
    expect(output).toContain('readonly \'related\': ReadonlyArray<SharedTag>;');
    expect(output).toContain('export interface WidgetResponse extends BaseEntity');
    expect(output).toContain('body: CreateWidgetRequest,');
    expect(output).toContain('Promise<WidgetResponse>');
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
    expect(output).toContain('.map(res => option(res) as unknown as Option<any>)');
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
    expect(output).toContain('queryParams.push(`function=${encodeParamValue($function)}`);');
  });

  it('renders void responses for no-content operations', async () => {
    const spec = {
      components: {
        schemas: {}
      },
      paths: {
        '/jobs/{jobId}': {
          delete: {
            operationId: 'deleteJob',
            parameters: [
              {
                in: 'path',
                name: 'jobId',
                required: true,
                schema: { type: 'string' }
              }
            ],
            responses: {
              204: {
                description: 'deleted'
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
    expect(output).toContain('export async function deleteJob(');
    expect(output).toContain('jobId: string,');
    expect(output).toContain('): Promise<void>');
    expect(output).toContain('Promise<TryLike<void>>');
    expect(output).toContain('`${requestOptions.apiPrefix}/jobs/${encodeURIComponent(String(jobId))}${query}`');
  });

  it('renders cookie params and encoded repeated query params', async () => {
    const spec = {
      components: {
        schemas: {}
      },
      paths: {
        '/reports': {
          get: {
            operationId: 'getReports',
            parameters: [
              {
                in: 'query',
                name: 'ids',
                required: true,
                schema: {
                  type: 'array',
                  items: { type: 'string' }
                }
              },
              {
                in: 'cookie',
                name: 'session_id',
                required: false,
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
    expect(output).toContain('ids.forEach(p => {');
    expect(output).toContain('queryParams.push(`ids=${encodeParamValue(p)}`);');
    expect(output).toContain('const cookieParams = [];');
    expect(output).toContain('cookieParams.push(`session_id=${encodeParamValue(session_id)}`);');
    expect(output).toContain('headers[\'Cookie\'] = headers[\'Cookie\'] ? `${headers[\'Cookie\']}; ${cookieParams.join(\'; \')}` : cookieParams.join(\'; \');');
  });

  it('renders wrapped scats union types in DTOs and methods', async () => {
    const spec = {
      components: {
        schemas: {
          Foo: {
            type: 'object',
            required: ['id'],
            properties: {
              id: {type: 'string'}
            }
          },
          UnionCarrier: {
            type: 'object',
            properties: {
              payload: {
                anyOf: [
                  {$ref: '#/components/schemas/Foo'},
                  {type: 'string'},
                  {type: 'null'}
                ]
              },
              items: {
                oneOf: [
                  {
                    type: 'array',
                    items: {$ref: '#/components/schemas/Foo'}
                  },
                  {
                    type: 'array',
                    items: {type: 'string'}
                  }
                ]
              }
            }
          }
        }
      },
      paths: {
        '/union': {
          post: {
            operationId: 'submitUnion',
            requestBody: {
              required: false,
              content: {
                'application/json': {
                  schema: {
                    anyOf: [
                      {$ref: '#/components/schemas/Foo'},
                      {type: 'string'},
                      {type: 'null'}
                    ]
                  }
                }
              }
            },
            responses: {
              200: {
                content: {
                  'application/json': {
                    schema: {$ref: '#/components/schemas/UnionCarrier'}
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
    await renderer.renderToFile(schemasMap.values, methods, true, false, targetFile);

    const output = fs.readFileSync(targetFile, 'utf8');
    expect(output).toContain('readonly payload: Option<FooDto | string>,');
    expect(output).toContain('readonly items: Collection<FooDto | string>,');
    expect(output).toContain('body: Option<FooDto | string>,');
    expect(output).toContain('body.map(value => scatsToJsonValue(value)).orUndefined,');
    expect(output).toContain('\'payload\': this.payload.map(value => scatsToJsonValue(value)).orUndefined,');
  });

  it('renders scats response arrays of DTO refs with direct item mapping', async () => {
    const spec = {
      components: {
        schemas: {
          Pet: {
            type: 'object',
            required: ['id'],
            properties: {
              id: {type: 'string'}
            }
          }
        }
      },
      paths: {
        '/pets': {
          get: {
            operationId: 'listPetsWrapped',
            responses: {
              200: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'array',
                      items: {$ref: '#/components/schemas/Pet'}
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
    await renderer.renderToFile(schemasMap.values, methods, true, false, targetFile);

    const output = fs.readFileSync(targetFile, 'utf8');
    expect(output).toContain('Promise<TryLike<Collection<PetDto>>>');
    expect(output).toContain('.map(i => PetDto.fromJson(i))');
    expect(output).toContain('as unknown as Collection<PetDto>');
  });

  it('renders scats mixed union responses as Option-wrapped branch unions', async () => {
    const spec = {
      components: {
        schemas: {
          Foo: {
            type: 'object',
            required: ['id'],
            properties: {
              id: {type: 'string'}
            }
          }
        }
      },
      paths: {
        '/union-response': {
          get: {
            operationId: 'getUnionResponse',
            responses: {
              200: {
                content: {
                  'application/json': {
                    schema: {
                      anyOf: [
                        {$ref: '#/components/schemas/Foo'},
                        {type: 'string'},
                        {type: 'null'}
                      ]
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
    await renderer.renderToFile(schemasMap.values, methods, true, false, targetFile);

    const output = fs.readFileSync(targetFile, 'utf8');
    expect(output).toContain('Promise<TryLike<Option<FooDto | string>>>');
    expect(output).toContain('.map(res => option(res) as unknown as Option<FooDto | string>)');
  });

  it('renders inline-object response arrays without nonexistent fromJson calls', async () => {
    const spec = {
      components: {
        schemas: {
          InlineCarrier: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  oneOf: [
                    {
                      type: 'object',
                      required: ['note'],
                      properties: {
                        note: {type: 'string'}
                      }
                    },
                    {type: 'string'}
                  ]
                }
              }
            }
          }
        }
      },
      paths: {
        '/inline-array-response': {
          get: {
            operationId: 'getInlineArrayResponse',
            responses: {
              200: {
                content: {
                  'application/json': {
                    schema: {$ref: '#/components/schemas/InlineCarrier'}
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
    await renderer.renderToFile(schemasMap.values, methods, true, false, targetFile);

    const output = fs.readFileSync(targetFile, 'utf8');
    expect(output).toContain('readonly items: Collection<{ note: string } | string>,');
    expect(output).toContain('as unknown as Collection<{ note: string } | string>');
    expect(output).not.toContain('Collection<{ note: string } | string>.fromJson');
  });
});
