import {describe, expect, it} from '@jest/globals';
import {
  filterUsedSchemas,
  resolvePaths,
  resolveSchemas,
  resolveSchemasTypes
} from '../src/components-parse.js';
import {Property} from '../src/property.js';
import {emptyOptions} from './support/test-helpers.js';

describe('components parsing - request bodies', () => {
  it('keeps inline oneOf request bodies as unions and retains referenced schemas', () => {
    const requestBodyOneOfSpec = {
      components: {
        schemas: {
          AlphaVariant: {
            title: 'AlphaVariant',
            type: 'object',
            properties: {
              kind: {type: 'string'},
              alphaCode: {type: 'string'}
            }
          },
          BetaVariant: {
            title: 'BetaVariant',
            type: 'object',
            properties: {
              kind: {type: 'string'},
              betaCount: {type: 'integer'}
            }
          },
          ActionResponse: {
            title: 'ActionResponse',
            type: 'object',
            properties: {
              ok: {type: 'boolean'}
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
                      {$ref: '#/components/schemas/AlphaVariant'},
                      {$ref: '#/components/schemas/BetaVariant'}
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
                    schema: {$ref: '#/components/schemas/ActionResponse'}
                  }
                }
              }
            }
          }
        }
      }
    };

    const options = {
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
              ok: {type: 'boolean'}
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
                      token: {type: 'string'},
                      count: {type: 'integer'}
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
                    schema: {$ref: '#/components/schemas/InlineObjectResponse'}
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
});

