import {describe, expect, it} from '@jest/globals';
import {resolveSchemas, resolveSchemasTypes} from '../src/components-parse.js';
import {SchemaObject} from '../src/schemas.js';
import {Property} from '../src/property.js';
import {emptyOptions} from './support/test-helpers.js';

function getProperty(spec: any, schemaName: string, propertyName: string): Property {
  const types = resolveSchemasTypes(spec);
  const schemas = resolveSchemas(spec, types, emptyOptions);
  const container = schemas.get(schemaName).get as SchemaObject;
  const property = container.properties.toArray.find(p => p.name === propertyName);

  expect(property).toBeDefined();
  return property as Property;
}

describe('components parsing - scats union wrappers', () => {
  const baseSchemas = {
    Foo: {
      type: 'object',
      required: ['id'],
      properties: {
        id: {type: 'string'}
      }
    },
    Bar: {
      type: 'object',
      required: ['name'],
      properties: {
        name: {type: 'string'}
      }
    }
  };

  it('wraps nullable primitives as Option<T>', () => {
    const spec = {
      components: {
        schemas: {
          ...baseSchemas,
          PrimitiveContainer: {
            type: 'object',
            properties: {
              value: {
                type: ['string', 'null']
              }
            }
          }
        }
      },
      paths: {}
    };

    const value = getProperty(spec, 'PrimitiveContainer', 'value');
    expect(value.scatsWrapperType).toBe('Option<string>');
  });

  it('wraps nullable object refs as Option<FooDto>', () => {
    const spec = {
      components: {
        schemas: {
          ...baseSchemas,
          RefContainer: {
            type: 'object',
            properties: {
              payload: {
                anyOf: [
                  {$ref: '#/components/schemas/Foo'},
                  {type: 'null'}
                ]
              }
            }
          }
        }
      },
      paths: {}
    };

    const payload = getProperty(spec, 'RefContainer', 'payload');
    expect(payload.scatsWrapperType).toBe('Option<Foo>');
  });

  it('wraps object unions branch-by-branch', () => {
    const spec = {
      components: {
        schemas: {
          ...baseSchemas,
          RefUnionContainer: {
            type: 'object',
            required: ['payload'],
            properties: {
              payload: {
                oneOf: [
                  {$ref: '#/components/schemas/Foo'},
                  {$ref: '#/components/schemas/Bar'}
                ]
              }
            }
          }
        }
      },
      paths: {}
    };

    const payload = getProperty(spec, 'RefUnionContainer', 'payload');
    expect(payload.scatsWrapperType).toBe('Foo | Bar');
  });

  it('wraps mixed object and primitive unions branch-by-branch', () => {
    const spec = {
      components: {
        schemas: {
          ...baseSchemas,
          MixedUnionContainer: {
            type: 'object',
            required: ['payload'],
            properties: {
              payload: {
                oneOf: [
                  {$ref: '#/components/schemas/Foo'},
                  {type: 'string'}
                ]
              }
            }
          }
        }
      },
      paths: {}
    };

    const payload = getProperty(spec, 'MixedUnionContainer', 'payload');
    expect(payload.scatsWrapperType).toBe('Foo | string');
  });

  it('wraps mixed nullable unions as Option<...>', () => {
    const spec = {
      components: {
        schemas: {
          ...baseSchemas,
          NullableMixedUnionContainer: {
            type: 'object',
            properties: {
              payload: {
                anyOf: [
                  {$ref: '#/components/schemas/Foo'},
                  {type: 'string'},
                  {type: 'null'}
                ]
              }
            }
          }
        }
      },
      paths: {}
    };

    const payload = getProperty(spec, 'NullableMixedUnionContainer', 'payload');
    expect(payload.scatsWrapperType).toBe('Option<Foo | string>');
  });

  it('keeps nullable arrays as Collection rather than Option<Collection>', () => {
    const spec = {
      components: {
        schemas: {
          ...baseSchemas,
          NullableArrayContainer: {
            type: 'object',
            properties: {
              items: {
                type: ['array', 'null'],
                items: {
                  type: 'string'
                }
              }
            }
          }
        }
      },
      paths: {}
    };

    const items = getProperty(spec, 'NullableArrayContainer', 'items');
    expect(items.scatsWrapperType).toBe('Collection<string>');
  });

  it('wraps array item unions branch-by-branch', () => {
    const spec = {
      components: {
        schemas: {
          ...baseSchemas,
          ArrayUnionContainer: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  oneOf: [
                    {$ref: '#/components/schemas/Foo'},
                    {$ref: '#/components/schemas/Bar'}
                  ]
                }
              }
            }
          }
        }
      },
      paths: {}
    };

    const items = getProperty(spec, 'ArrayUnionContainer', 'items');
    expect(items.scatsWrapperType).toBe('Collection<Foo | Bar>');
  });

  it('normalizes unions of arrays into a collection of wrapped items', () => {
    const spec = {
      components: {
        schemas: {
          ...baseSchemas,
          ArrayOrArrayContainer: {
            type: 'object',
            properties: {
              items: {
                oneOf: [
                  {
                    type: 'array',
                    items: {
                      $ref: '#/components/schemas/Foo'
                    }
                  },
                  {
                    type: 'array',
                    items: {
                      $ref: '#/components/schemas/Bar'
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

    const items = getProperty(spec, 'ArrayOrArrayContainer', 'items');
    expect(items.scatsWrapperType).toBe('Collection<Foo | Bar>');
  });

  it('wraps nullable inline object literals as Option<{ ... }>', () => {
    const spec = {
      components: {
        schemas: {
          ...baseSchemas,
          InlineObjectContainer: {
            type: 'object',
            properties: {
              payload: {
                anyOf: [
                  {
                    type: 'object',
                    required: ['x'],
                    properties: {
                      x: {
                        type: 'string'
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

    const payload = getProperty(spec, 'InlineObjectContainer', 'payload');
    expect(payload.scatsWrapperType).toBe('Option<{ x: string }>');
  });

  it('wraps refs with punctuation-normalized schema names as Dto types', () => {
    const spec = {
      components: {
        schemas: {
          'ImageRefParam-2': {
            type: 'object',
            properties: {
              image_url: {type: 'string'},
              file_id: {type: 'string'}
            }
          },
          RequestCarrier: {
            type: 'object',
            properties: {
              input_reference: {
                $ref: '#/components/schemas/ImageRefParam-2'
              }
            }
          }
        }
      },
      paths: {}
    };

    const inputReference = getProperty(spec, 'RequestCarrier', 'input_reference');
    expect(inputReference.scatsWrapperType).toBe('Option<ImageRefParam2Dto>');
  });
});
