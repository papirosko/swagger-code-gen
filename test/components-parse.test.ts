import {describe, expect, it} from '@jest/globals';
import {HashSet} from 'scats';
import {
  filterUsedSchemas,
  resolvePaths,
  resolveSchemas,
  resolveSchemasTypes
} from '../src/components-parse.js';
import {GenerationOptions, SchemaObject} from '../src/schemas.js';
import {Property} from '../src/property.js';

const emptyOptions: GenerationOptions = {
  referencedObjectsNullableByDefault: false,
  includeTags: HashSet.from<string>([]),
  excludeTags: HashSet.from<string>([]),
  onlyUsedSchemas: false,
  includeSchemasByMask: HashSet.from<string>([])
};

describe('components parsing', () => {
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
      },
      requestBodies: {
        Upload: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Pet' }
            }
          }
        },
        Choice: {
          content: {
            'application/json': {
              schema: {
                anyOf: [
                  { $ref: '#/components/schemas/Pet' },
                  { $ref: '#/components/schemas/Status' }
                ]
              }
            }
          }
        }
      }
    },
    paths: {
      '/pets': {
        get: {
          tags: ['public'],
          operationId: 'listPets',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
            { name: 'x-trace', in: 'header', schema: { type: 'string' } }
          ],
          responses: {
            200: {
              description: 'ok',
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
      },
      '/admin': {
        get: {
          tags: ['private'],
          operationId: 'getAdmin',
          responses: { 200: { description: 'ok', content: {} } }
        }
      }
    }
  };

  it('classifies schemas and shared bodies correctly', () => {
    const types = resolveSchemasTypes(spec);

    expect(types.get('Pet').getOrElseValue('object')).toBe('object');
    expect(types.get('Status').getOrElseValue('property')).toBe('enum');
    expect(types.get('Upload$RequestBody').getOrElseValue('property')).toBe('object');
    expect(types.get('Choice$RequestBody').getOrElseValue('object')).toBe('property');
  });

  it('builds schema pool including request bodies and unions', () => {
    const types = resolveSchemasTypes(spec);
    const schemas = resolveSchemas(spec, types, emptyOptions);

    const pet = schemas.get('Pet').get as SchemaObject;
    expect(pet.properties.map(p => p.name).toSet.toArray).toEqual(['id', 'name']);

    const choiceBody = schemas.get('Choice$RequestBody').get as Property;
    expect(choiceBody.schemaType).toBe('property');
    expect(choiceBody.jsType).toBe('Pet | Status');
  });

  it('filters paths by include/exclude tags', () => {
    const includeOptions: GenerationOptions = {
      ...emptyOptions,
      includeTags: HashSet.from(['public']),
      excludeTags: HashSet.from(['private'])
    };
    const types = resolveSchemasTypes(spec);
    const schemas = resolveSchemas(spec, types, includeOptions);
    const methods = resolvePaths(spec, types, includeOptions, schemas);

    expect(methods.size).toBe(1);
    expect(methods.head.endpointName).toBe('listPets');
    expect(methods.head.response.responseType).toBe('ReadonlyArray<Pet>');
  });

  it('keeps only schemas used by filtered methods', () => {
    const includeOptions: GenerationOptions = {
      ...emptyOptions,
      includeTags: HashSet.from(['public']),
      excludeTags: HashSet.from(['private']),
      onlyUsedSchemas: true
    };
    const types = resolveSchemasTypes(spec);
    const schemas = resolveSchemas(spec, types, includeOptions);
    const methods = resolvePaths(spec, types, includeOptions, schemas);
    const usedSchemas = filterUsedSchemas(methods, schemas);

    expect(usedSchemas.keySet.toArray).toEqual(['Pet']);
  });

  it('force-includes schemas by wildcard mask with dependencies', () => {
    const includeOptions: GenerationOptions = {
      ...emptyOptions,
      includeTags: HashSet.from(['public']),
      excludeTags: HashSet.from(['private']),
      onlyUsedSchemas: true,
      includeSchemasByMask: HashSet.from(['Status'])
    };
    const types = resolveSchemasTypes(spec);
    const schemas = resolveSchemas(spec, types, includeOptions);
    const methods = resolvePaths(spec, types, includeOptions, schemas);
    const usedSchemas = filterUsedSchemas(methods, schemas, includeOptions.includeSchemasByMask);

    expect(usedSchemas.keySet.toArray).toEqual(expect.arrayContaining(['Pet', 'Status']));
    expect(usedSchemas.keySet.size).toBe(2);
  });

  it('keeps inline oneOf request bodies as unions and retains referenced schemas', () => {
    const requestBodyOneOfSpec = {
      components: {
        schemas: {
          AlphaVariant: {
            title: 'AlphaVariant',
            type: 'object',
            properties: {
              kind: { type: 'string' },
              alphaCode: { type: 'string' }
            }
          },
          BetaVariant: {
            title: 'BetaVariant',
            type: 'object',
            properties: {
              kind: { type: 'string' },
              betaCount: { type: 'integer' }
            }
          },
          ActionResponse: {
            title: 'ActionResponse',
            type: 'object',
            properties: {
              ok: { type: 'boolean' }
            }
          }
        }
      },
      paths: {
        '/custom/submit': {
          post: {
            tags: ['public'],
            operationId: 'submitCustomAction',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    oneOf: [
                      { $ref: '#/components/schemas/AlphaVariant' },
                      { $ref: '#/components/schemas/BetaVariant' }
                    ]
                  }
                }
              }
            },
            responses: {
              200: {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ActionResponse' }
                  }
                }
              }
            }
          }
        }
      }
    };

    const options: GenerationOptions = {
      ...emptyOptions,
      onlyUsedSchemas: true
    };
    const types = resolveSchemasTypes(requestBodyOneOfSpec);
    const schemas = resolveSchemas(requestBodyOneOfSpec, types, options);
    const methods = resolvePaths(requestBodyOneOfSpec, types, options, schemas);

    expect(methods.size).toBe(1);
    expect(methods.head.body.size).toBe(1);

    const requestBody = methods.head.body.head.body;
    expect(requestBody).toBeInstanceOf(Property);
    expect((requestBody as Property).jsType).toBe('AlphaVariant | BetaVariant');

    const usedSchemas = filterUsedSchemas(methods, schemas);
    expect(usedSchemas.keySet.toArray).toEqual(
      expect.arrayContaining(['AlphaVariant', 'BetaVariant', 'ActionResponse'])
    );
  });

  it('assigns a concrete type name to inline object request bodies', () => {
    const inlineObjectBodySpec = {
      components: {
        schemas: {
          InlineObjectResponse: {
            title: 'InlineObjectResponse',
            type: 'object',
            properties: {
              ok: { type: 'boolean' }
            }
          }
        }
      },
      paths: {
        '/custom/object-body': {
          post: {
            tags: ['public'],
            operationId: 'submitInlineObject',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      token: { type: 'string' },
                      count: { type: 'integer' }
                    },
                    required: ['token']
                  }
                }
              }
            },
            responses: {
              200: {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/InlineObjectResponse' }
                  }
                }
              }
            }
          }
        }
      }
    };

    const types = resolveSchemasTypes(inlineObjectBodySpec);
    const schemas = resolveSchemas(inlineObjectBodySpec, types, emptyOptions);
    const methods = resolvePaths(inlineObjectBodySpec, types, emptyOptions, schemas);

    expect(methods.size).toBe(1);
    expect(methods.head.body.size).toBe(1);

    const requestBody = methods.head.body.head.body;
    expect(requestBody).toBeInstanceOf(Property);
    expect((requestBody as Property).jsType).toBe('SubmitInlineObjectBody$post');
  });

  it('keeps nullable string enums quoted in object properties', () => {
    const nullableEnumSpec = {
      components: {
        schemas: {
          NullableEnumContainer: {
            title: 'NullableEnumContainer',
            type: 'object',
            properties: {
              'service_tier': {
                enum: ['auto', 'default', 'fast', 'flex', 'priority', 'scale', null],
                type: ['string', 'null']
              }
            }
          }
        }
      },
      paths: {}
    };

    const types = resolveSchemasTypes(nullableEnumSpec);
    const schemas = resolveSchemas(nullableEnumSpec, types, emptyOptions);
    const container = schemas.get('NullableEnumContainer').get as SchemaObject;
    const serviceTier = container.properties.toArray.find(p => p.name === 'service_tier');

    expect(serviceTier).toBeDefined();
    expect((serviceTier as Property).jsType)
      .toBe('\'auto\' | \'default\' | \'fast\' | \'flex\' | \'priority\' | \'scale\' | null');
  });


  it('keeps nullable string enums out of Option inner nulls', () => {
    const nullableEnumSpec = {
      components: {
        schemas: {
          NullableEnumContainer: {
            title: 'NullableEnumContainer',
            type: 'object',
            properties: {
              'service_tier': {
                enum: ['auto', 'default', 'fast', 'flex', 'priority', 'scale', null],
                type: ['string', 'null']
              }
            }
          }
        }
      },
      paths: {}
    };

    const types = resolveSchemasTypes(nullableEnumSpec);
    const schemas = resolveSchemas(nullableEnumSpec, types, emptyOptions);
    const container = schemas.get('NullableEnumContainer').get as SchemaObject;
    const serviceTier = container.properties.toArray.find(p => p.name === 'service_tier');

    expect(serviceTier).toBeDefined();
    expect((serviceTier as Property).jsType)
      .toBe('\'auto\' | \'default\' | \'fast\' | \'flex\' | \'priority\' | \'scale\' | null');
    expect((serviceTier as Property).scatsWrapperType)
      .toBe('Option<\'auto\' | \'default\' | \'fast\' | \'flex\' | \'priority\' | \'scale\'>');
  });

  it('strips null from primitive types wrapped in Option', () => {
    const nullablePrimitiveSpec = {
      components: {
        schemas: {
          NullablePrimitiveContainer: {
            title: 'NullablePrimitiveContainer',
            type: 'object',
            properties: {
              'session_id': {
                type: ['string', 'null']
              }
            }
          }
        }
      },
      paths: {}
    };

    const types = resolveSchemasTypes(nullablePrimitiveSpec);
    const schemas = resolveSchemas(nullablePrimitiveSpec, types, emptyOptions);
    const container = schemas.get('NullablePrimitiveContainer').get as SchemaObject;
    const sessionId = container.properties.toArray.find(p => p.name === 'session_id');

    expect(sessionId).toBeDefined();
    expect((sessionId as Property).jsType).toBe('string | null');
    expect((sessionId as Property).scatsWrapperType).toBe('Option<string>');
  });

});
