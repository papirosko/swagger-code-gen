import {describe, expect, it} from '@jest/globals';
import {HashSet} from 'scats';
import {
  resolvePaths,
  resolveSchemas,
  resolveSchemasTypes
} from '../src/components-parse.js';
import {GenerationOptions, SchemaObject} from '../src/schemas.js';
import {Property} from '../src/property.js';

const emptyOptions: GenerationOptions = {
  referencedObjectsNullableByDefault: false,
  includeTags: HashSet.from<string>([]),
  excludeTags: HashSet.from<string>([])
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
});
