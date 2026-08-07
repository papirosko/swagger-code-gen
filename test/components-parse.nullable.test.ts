import {describe, expect, it} from '@jest/globals';
import {resolveSchemas, resolveSchemasTypes} from '../src/components-parse.js';
import {SchemaObject} from '../src/schemas.js';
import {Property} from '../src/property.js';
import {emptyOptions} from './support/test-helpers.js';

describe('components parsing - nullable handling', () => {
  it('quotes string enum values even when enum property omits type', () => {
    const enumSpec = {
      components: {
        schemas: {
          DefaultConfiguration: {
            type: 'object',
            properties: {
              defaultForNewRepos: {
                enum: ['public', 'private_and_internal', 'all']
              }
            }
          }
        }
      },
      paths: {}
    };

    const types = resolveSchemasTypes(enumSpec);
    const schemas = resolveSchemas(enumSpec, types, emptyOptions);
    const container = schemas.get('DefaultConfiguration').get as SchemaObject;
    const defaultForNewRepos = container.properties.toArray.find(p => p.name === 'defaultForNewRepos');

    expect(defaultForNewRepos).toBeDefined();
    expect((defaultForNewRepos as Property).jsType)
      .toBe('\'public\' | \'private_and_internal\' | \'all\'');
    expect((defaultForNewRepos as Property).scatsWrapperType)
      .toBe('Option<\'public\' | \'private_and_internal\' | \'all\'>');
  });

  it('keeps nullable string enums quoted in object properties', () => {
    const nullableEnumSpec = {
      components: {
        schemas: {
          NullableEnumContainer: {
            title: 'NullableEnumContainer',
            type: 'object',
            properties: {
              serviceTier: {
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
    const serviceTier = container.properties.toArray.find(p => p.name === 'serviceTier');

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
              serviceTier: {
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
    const serviceTier = container.properties.toArray.find(p => p.name === 'serviceTier');

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
              sessionId: {
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
    const sessionId = container.properties.toArray.find(p => p.name === 'sessionId');

    expect(sessionId).toBeDefined();
    expect((sessionId as Property).jsType).toBe('string | null');
    expect((sessionId as Property).scatsWrapperType).toBe('Option<string>');
  });

  it('keeps nullable arrays as Collection instead of Option<Collection>', () => {
    const nullableArraySpec = {
      components: {
        schemas: {
          NullableArrayContainer: {
            title: 'NullableArrayContainer',
            type: 'object',
            properties: {
              tags: {
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

    const types = resolveSchemasTypes(nullableArraySpec);
    const schemas = resolveSchemas(nullableArraySpec, types, emptyOptions);
    const container = schemas.get('NullableArrayContainer').get as SchemaObject;
    const tags = container.properties.toArray.find(p => p.name === 'tags');

    expect(tags).toBeDefined();
    expect((tags as Property).jsType).toBe('ReadonlyArray<string> | null');
    expect((tags as Property).scatsWrapperType).toBe('Collection<string>');
  });
});
