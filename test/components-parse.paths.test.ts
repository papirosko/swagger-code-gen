import {describe, expect, it} from '@jest/globals';
import {HashSet} from 'scats';
import {
  resolvePaths,
  resolveSchemas,
  resolveSchemasTypes
} from '../src/components-parse.js';
import {GenerationOptions} from '../src/schemas.js';
import {emptyOptions} from './support/test-helpers.js';

const spec = {
  components: {
    schemas: {
      Pet: {
        title: 'Pet',
        type: 'object',
        properties: {
          id: {type: 'integer'},
          name: {type: 'string'}
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
          {name: 'limit', in: 'query', schema: {type: 'integer'}},
          {name: 'x-trace', in: 'header', schema: {type: 'string'}}
        ],
        responses: {
          200: {
            description: 'ok',
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
    },
    '/admin': {
      get: {
        tags: ['private'],
        operationId: 'getAdmin',
        responses: {200: {description: 'ok', content: {}}}
      }
    }
  }
};

describe('components parsing - paths', () => {
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
});

