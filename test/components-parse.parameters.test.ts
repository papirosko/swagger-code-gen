import {describe, expect, it} from '@jest/globals';
import {resolvePaths, resolveSchemas, resolveSchemasTypes} from '../src/components-parse.js';
import {emptyOptions} from './support/test-helpers.js';

describe('components parsing - parameters', () => {
  it('resolves operation-level parameter refs from components.parameters', () => {
    const spec = {
      components: {
        parameters: {
          entityId: {
            in: 'path',
            name: 'entityId',
            required: true,
            schema: {type: 'string'}
          },
          includeDetails: {
            in: 'query',
            name: 'details',
            schema: {
              type: 'string',
              enum: ['0', '1'],
              default: '0'
            }
          }
        },
        schemas: {
          ResourceRecord: {
            title: 'ResourceRecord',
            type: 'object',
            properties: {
              hash: {type: 'string'}
            }
          }
        }
      },
      paths: {
        '/resources/{entityId}': {
          get: {
            operationId: 'getResource',
            parameters: [
              {$ref: '#/components/parameters/entityId'},
              {$ref: '#/components/parameters/includeDetails'}
            ],
            responses: {
              200: {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {$ref: '#/components/schemas/ResourceRecord'}
                  }
                }
              }
            }
          }
        }
      }
    };

    const types = resolveSchemasTypes(spec);
    const schemas = resolveSchemas(spec, types, emptyOptions);

    expect(() => resolvePaths(spec, types, emptyOptions, schemas)).not.toThrow();

    const methods = resolvePaths(spec, types, emptyOptions, schemas);
    expect(methods.size).toBe(1);
    expect(methods.head.parameters.map(p => `${p.in}:${p.rawName}:${p.jsType}`).toArray)
      .toEqual(['path:entityId:string', 'query:details:\'0\' | \'1\'']);
  });
});
