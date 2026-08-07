import {describe, expect, it} from '@jest/globals';
import {HashSet} from 'scats';
import {
  filterUsedSchemas,
  resolvePaths,
  resolveSchemas,
  resolveSchemasTypes
} from '../src/components-parse.js';
import {SchemaObject, GenerationOptions} from '../src/schemas.js';
import {emptyOptions} from './support/test-helpers.js';
import {Property} from '../src/property.js';

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
            schema: {$ref: '#/components/schemas/Pet'}
          }
        }
      },
      Choice: {
        content: {
          'application/json': {
            schema: {
              anyOf: [
                {$ref: '#/components/schemas/Pet'},
                {$ref: '#/components/schemas/Status'}
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

describe('components parsing - schemas', () => {
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

    const choiceBody = schemas.get('Choice$RequestBody').get;
    expect(choiceBody.schemaType).toBe('property');
    expect(choiceBody.jsType).toBe('Pet | Status');
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

  it('keeps primitive-plus-ref oneOf unions as valid TS types', () => {
    const oneOfUnionSpec = {
      components: {
        schemas: {
          ExternalRef: {
            title: 'ExternalRef',
            type: 'string'
          },
          ScalarOrRef: {
            oneOf: [
              {
                title: 'NumericScalar',
                type: 'integer'
              },
              {
                $ref: '#/components/schemas/ExternalRef'
              }
            ]
          }
        }
      },
      paths: {}
    };

    const types = resolveSchemasTypes(oneOfUnionSpec);
    const schemas = resolveSchemas(oneOfUnionSpec, types, emptyOptions);
    const scalarOrRef = schemas.get('ScalarOrRef').get as Property;

    expect(scalarOrRef.schemaType).toBe('property');
    expect(scalarOrRef.type).toBe('number | ExternalRef');
    expect(scalarOrRef.jsType).toBe('number | ExternalRef');
  });

  it('keeps inline object oneOf schemas as structural unions', () => {
    const polymorphicContainerSpec = {
      components: {
        schemas: {
          PolymorphicContainer: {
            oneOf: [
              {
                title: 'firstVariant',
                type: 'object',
                required: ['firstVariant'],
                properties: {
                  firstVariant: {
                    type: 'object',
                    required: ['primaryMetric'],
                    properties: {
                      primaryMetric: {type: 'integer'}
                    }
                  }
                }
              },
              {
                title: 'secondVariant',
                type: 'object',
                required: ['secondVariant'],
                properties: {
                  secondVariant: {
                    type: 'object',
                    required: ['primaryMetric', 'secondaryMetric'],
                    properties: {
                      primaryMetric: {type: 'integer'},
                      secondaryMetric: {type: 'integer'}
                    }
                  }
                }
              }
            ]
          }
        }
      },
      paths: {}
    };

    const types = resolveSchemasTypes(polymorphicContainerSpec);
    const schemas = resolveSchemas(polymorphicContainerSpec, types, emptyOptions);
    const polymorphicContainer = schemas.get('PolymorphicContainer').get as Property;

    expect(polymorphicContainer.schemaType).toBe('property');
    expect(polymorphicContainer.jsType).toBe(
      '{ firstVariant: { primaryMetric: number } } | { secondVariant: { primaryMetric: number; secondaryMetric: number } }'
    );
  });

  it('normalizes primitive array members inside oneOf unions', () => {
    const scalarOrArraySpec = {
      components: {
        schemas: {
          ScalarOrArray: {
            oneOf: [
              {
                type: 'string'
              },
              {
                type: 'array',
                items: {
                  type: 'integer'
                }
              }
            ]
          }
        }
      },
      paths: {}
    };

    const types = resolveSchemasTypes(scalarOrArraySpec);
    const schemas = resolveSchemas(scalarOrArraySpec, types, emptyOptions);
    const scalarOrArray = schemas.get('ScalarOrArray').get as Property;

    expect(scalarOrArray.schemaType).toBe('property');
    expect(scalarOrArray.jsType).toBe('string | ReadonlyArray<number>');
  });

  it('supports OpenAPI 3.1 type arrays with nullability', () => {
    const openApi31Spec = {
      components: {
        schemas: {
          NullableString: {
            type: ['string', 'null']
          },
          NullableStringArray: {
            type: ['array', 'null'],
            items: {
              type: ['integer', 'null']
            }
          }
        }
      },
      paths: {}
    };

    const types = resolveSchemasTypes(openApi31Spec);
    const schemas = resolveSchemas(openApi31Spec, types, emptyOptions);
    const nullableString = schemas.get('NullableString').get as Property;
    const nullableStringArray = schemas.get('NullableStringArray').get as Property;

    expect(nullableString.schemaType).toBe('property');
    expect(nullableString.jsType).toBe('string | null');
    expect(nullableStringArray.schemaType).toBe('property');
    expect(nullableStringArray.jsType).toBe('ReadonlyArray<number | null> | null');
  });

  it('preserves nested array unions inside inline object members', () => {
    const nestedUnionSpec = {
      components: {
        schemas: {
          NestedUnionContainer: {
            type: 'object',
            required: ['content'],
            properties: {
              content: {
                anyOf: [
                  { type: 'string' },
                  {
                    type: 'array',
                    items: {
                      oneOf: [
                        { type: 'string' },
                        {
                          type: 'object',
                          required: ['type', 'tool_name'],
                          properties: {
                            type: { type: 'string' },
                            'tool_name': { type: 'string' }
                          }
                        }
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      },
      paths: {}
    };

    const types = resolveSchemasTypes(nestedUnionSpec);
    const schemas = resolveSchemas(nestedUnionSpec, types, emptyOptions);
    const container = schemas.get('NestedUnionContainer').get as SchemaObject;
    const content = container.properties.find(p => p.name === 'content').get as Property;

    expect(content.jsType).toBe('string | ReadonlyArray<string | { type: string; tool_name: string }>');
  });

  it('keeps inline object properties when the object also uses oneOf branches for required fields', () => {
    const objectWithPropertiesAndOneOfSpec = {
      components: {
        schemas: {
          ToolResourcesContainer: {
            type: 'object',
            properties: {
              tool_resources: {
                anyOf: [
                  {
                    type: 'object',
                    properties: {
                      code_interpreter: {
                        type: 'object',
                        properties: {
                          file_ids: {
                            type: 'array',
                            items: {type: 'string'}
                          }
                        }
                      },
                      file_search: {
                        type: 'object',
                        properties: {
                          vector_store_ids: {
                            type: 'array',
                            items: {type: 'string'}
                          },
                          vector_stores: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                file_ids: {
                                  type: 'array',
                                  items: {type: 'string'}
                                }
                              }
                            }
                          }
                        },
                        oneOf: [
                          {required: ['vector_store_ids']},
                          {required: ['vector_stores']}
                        ]
                      }
                    }
                  },
                  {type: 'null'}
                ]
              }
            }
          }
        }
      },
      paths: {}
    };

    const types = resolveSchemasTypes(objectWithPropertiesAndOneOfSpec);
    const schemas = resolveSchemas(objectWithPropertiesAndOneOfSpec, types, emptyOptions);
    const container = schemas.get('ToolResourcesContainer').get as SchemaObject;
    const toolResources = container.properties.find(p => p.name === 'tool_resources').get as Property;

    expect(toolResources.jsType).toBe(
      '{ code_interpreter?: { file_ids?: ReadonlyArray<string> }; file_search?: { vector_store_ids?: ReadonlyArray<string>; vector_stores?: ReadonlyArray<{ file_ids?: ReadonlyArray<string> }> } } | null'
    );
  });

  it('deduplicates repeated property names across allOf branches', () => {
    const duplicateAllOfSpec = {
      components: {
        schemas: {
          DuplicateCarrier: {
            allOf: [
              {
                type: 'object',
                properties: {
                  metadata: {type: 'string'},
                  temperature: {type: 'number'}
                }
              },
              {
                type: 'object',
                properties: {
                  metadata: {type: 'string'},
                  temperature: {type: 'number'},
                  top_p: {type: 'number'}
                }
              }
            ]
          }
        }
      },
      paths: {}
    };

    const types = resolveSchemasTypes(duplicateAllOfSpec);
    const schemas = resolveSchemas(duplicateAllOfSpec, types, emptyOptions);
    const duplicateCarrier = schemas.get('DuplicateCarrier').get as SchemaObject;

    expect(duplicateCarrier.properties.map(p => p.name).toArray).toEqual(['metadata', 'temperature', 'top_p']);
    expect(duplicateCarrier.properties.map(p => p.normalisedName).toArray).toEqual(['metadata', 'temperature', 'top_p']);
  });

  it('does not mutate own properties when reading inherited properties', () => {
    const inheritedSpec = {
      components: {
        schemas: {
          ParentConfig: {
            type: 'object',
            properties: {
              metadata: {type: 'string'},
              temperature: {type: 'number'}
            }
          },
          ChildConfig: {
            allOf: [
              {$ref: '#/components/schemas/ParentConfig'},
              {
                type: 'object',
                properties: {
                  messages: {
                    type: 'array',
                    items: {type: 'string'}
                  },
                  model: {type: 'string'}
                }
              }
            ]
          }
        }
      },
      paths: {}
    };

    const types = resolveSchemasTypes(inheritedSpec);
    const schemas = resolveSchemas(inheritedSpec, types, emptyOptions);
    const child = schemas.get('ChildConfig').get as SchemaObject;

    expect(child.properties.map(p => p.name).toArray).toEqual(['messages', 'model']);
    expect(child.propsIncludingInherited().map(p => p.name).toArray).toEqual(['messages', 'model', 'metadata', 'temperature']);
    expect(child.properties.map(p => p.name).toArray).toEqual(['messages', 'model']);
  });
});
