import {describe, expect, it} from '@jest/globals';
import {
  filterUsedSchemas,
  generateInPlace,
  resolvePaths,
  resolveSchemas,
  resolveSchemasTypes
} from '../src/components-parse.js';
import {SchemaObject} from '../src/schemas.js';
import {emptyOptions} from './support/test-helpers.js';

describe('components parsing - shared object regressions', () => {
  it('keeps shared object refs reachable from request, response, and inline bodies', () => {
    const spec = {
      components: {
        schemas: {
          SharedAddress: {
            type: 'object',
            required: ['city'],
            properties: {
              city: {type: 'string'},
              postalCode: {type: 'string'}
            }
          },
          CreateProfileRequest: {
            type: 'object',
            required: ['address'],
            properties: {
              address: {$ref: '#/components/schemas/SharedAddress'},
              aliases: {
                type: 'array',
                items: {$ref: '#/components/schemas/SharedAddress'}
              }
            }
          },
          ProfileResponse: {
            type: 'object',
            required: ['address', 'history'],
            properties: {
              address: {$ref: '#/components/schemas/SharedAddress'},
              history: {
                type: 'array',
                items: {$ref: '#/components/schemas/SharedAddress'}
              }
            }
          }
        }
      },
      paths: {
        '/profiles': {
          post: {
            operationId: 'createProfile',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {$ref: '#/components/schemas/CreateProfileRequest'}
                }
              }
            },
            responses: {
              200: {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {$ref: '#/components/schemas/ProfileResponse'}
                  }
                }
              }
            }
          }
        },
        '/profiles/audit': {
          post: {
            operationId: 'auditProfile',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['snapshot', 'previous'],
                    properties: {
                      snapshot: {$ref: '#/components/schemas/SharedAddress'},
                      previous: {
                        type: 'array',
                        items: {$ref: '#/components/schemas/SharedAddress'}
                      }
                    }
                  }
                }
              }
            },
            responses: {
              204: {
                description: 'no content'
              }
            }
          }
        }
      }
    };

    const types = resolveSchemasTypes(spec);
    const schemas = resolveSchemas(spec, types, emptyOptions);
    const methods = resolvePaths(spec, types, emptyOptions, schemas);
    const usedSchemas = filterUsedSchemas(methods, schemas);

    expect(usedSchemas.keySet.toArray.sort()).toEqual([
      'CreateProfileRequest',
      'ProfileResponse',
      'SharedAddress'
    ]);

    const createProfileMethod = methods.toArray.find(method => method.endpointName === 'createProfile');
    expect(createProfileMethod?.body.head.body.jsType).toBe('CreateProfileRequest');
    expect(createProfileMethod?.response.responseType).toBe('ProfileResponse');

    const inplaceSchemas = generateInPlace(methods, types, emptyOptions, schemas);
    const auditBodySchema = inplaceSchemas.toArray.find(schema => schema.name === 'AuditProfileBody$post');

    expect(auditBodySchema).toBeDefined();
    expect(auditBodySchema).toBeInstanceOf(SchemaObject);

    const snapshotProperty = auditBodySchema!.properties.toArray.find(property => property.name === 'snapshot');
    const previousProperty = auditBodySchema!.properties.toArray.find(property => property.name === 'previous');

    expect(snapshotProperty?.jsType).toBe('SharedAddress');
    expect(previousProperty?.jsType).toBe('ReadonlyArray<SharedAddress>');
  });

  it('keeps allOf parents and shared arrays for request and response models', () => {
    const spec = {
      components: {
        schemas: {
          BaseEntity: {
            type: 'object',
            required: ['id'],
            properties: {
              id: {type: 'string'}
            }
          },
          SharedTag: {
            type: 'object',
            required: ['label'],
            properties: {
              label: {type: 'string'}
            }
          },
          CreateWidgetRequest: {
            allOf: [
              {$ref: '#/components/schemas/BaseEntity'},
              {
                type: 'object',
                required: ['primaryTag', 'related'],
                properties: {
                  primaryTag: {$ref: '#/components/schemas/SharedTag'},
                  related: {
                    type: 'array',
                    items: {$ref: '#/components/schemas/SharedTag'}
                  }
                }
              }
            ]
          },
          WidgetResponse: {
            allOf: [
              {$ref: '#/components/schemas/BaseEntity'},
              {
                type: 'object',
                required: ['primaryTag', 'related', 'status'],
                properties: {
                  primaryTag: {$ref: '#/components/schemas/SharedTag'},
                  related: {
                    type: 'array',
                    items: {$ref: '#/components/schemas/SharedTag'}
                  },
                  status: {type: 'string'}
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
                  schema: {$ref: '#/components/schemas/CreateWidgetRequest'}
                }
              }
            },
            responses: {
              200: {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {$ref: '#/components/schemas/WidgetResponse'}
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
    const methods = resolvePaths(spec, types, emptyOptions, schemas);
    const usedSchemas = filterUsedSchemas(methods, schemas);

    const createWidgetRequest = schemas.get('CreateWidgetRequest').get as SchemaObject;
    const widgetResponse = schemas.get('WidgetResponse').get as SchemaObject;

    expect(createWidgetRequest.parents.keySet.toArray).toEqual(['BaseEntity']);
    expect(widgetResponse.parents.keySet.toArray).toEqual(['BaseEntity']);

    const requestPrimaryTag = createWidgetRequest.properties.toArray.find(property => property.name === 'primaryTag');
    const requestRelated = createWidgetRequest.properties.toArray.find(property => property.name === 'related');
    const responsePrimaryTag = widgetResponse.properties.toArray.find(property => property.name === 'primaryTag');
    const responseRelated = widgetResponse.properties.toArray.find(property => property.name === 'related');

    expect(requestPrimaryTag?.jsType).toBe('SharedTag');
    expect(requestRelated?.jsType).toBe('ReadonlyArray<SharedTag>');
    expect(responsePrimaryTag?.jsType).toBe('SharedTag');
    expect(responseRelated?.jsType).toBe('ReadonlyArray<SharedTag>');

    const createWidgetMethod = methods.toArray.find(method => method.endpointName === 'createWidget');
    expect(createWidgetMethod?.body.head.body.jsType).toBe('CreateWidgetRequest');
    expect(createWidgetMethod?.response.responseType).toBe('WidgetResponse');

    expect(usedSchemas.keySet.toArray.sort()).toEqual([
      'BaseEntity',
      'CreateWidgetRequest',
      'SharedTag',
      'WidgetResponse'
    ]);
  });

  it('tracks property-level allOf with $ref plus inline shared arrays inside inline bodies', () => {
    const spec = {
      components: {
        schemas: {
          SharedAddress: {
            type: 'object',
            required: ['city'],
            properties: {
              city: {type: 'string'}
            }
          },
          SharedResident: {
            type: 'object',
            required: ['name'],
            properties: {
              name: {type: 'string'}
            }
          }
        }
      },
      paths: {
        '/addresses/enrich': {
          post: {
            operationId: 'enrichAddress',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['address'],
                    properties: {
                      address: {
                        allOf: [
                          {$ref: '#/components/schemas/SharedAddress'},
                          {
                            type: 'object',
                            required: ['residents'],
                            properties: {
                              residents: {
                                type: 'array',
                                items: {$ref: '#/components/schemas/SharedResident'}
                              }
                            }
                          }
                        ]
                      }
                    }
                  }
                }
              }
            },
            responses: {
              204: {
                description: 'no content'
              }
            }
          }
        }
      }
    };

    const types = resolveSchemasTypes(spec);
    const schemas = resolveSchemas(spec, types, emptyOptions);
    const methods = resolvePaths(spec, types, emptyOptions, schemas);
    const usedSchemas = filterUsedSchemas(methods, schemas);
    const inplaceSchemas = generateInPlace(methods, types, emptyOptions, schemas);

    expect(usedSchemas.keySet.toArray.sort()).toEqual(['SharedAddress', 'SharedResident']);

    const inlineBodySchema = inplaceSchemas.toArray.find(schema => schema.name === 'EnrichAddressBody$post');
    expect(inlineBodySchema).toBeDefined();

    const addressProperty = inlineBodySchema!.properties.toArray.find(property => property.name === 'address');
    expect(addressProperty?.jsType).toBe('SharedAddress & { residents: ReadonlyArray<SharedResident> }');
  });

  it('keeps request and response variants separate when the same logical object shape diverges', () => {
    const spec = {
      components: {
        schemas: {
          SharedRecipientBase: {
            type: 'object',
            required: ['email'],
            properties: {
              email: {type: 'string'}
            }
          },
          ResolvedRecipient: {
            allOf: [
              {$ref: '#/components/schemas/SharedRecipientBase'},
              {
                type: 'object',
                required: ['id'],
                properties: {
                  id: {type: 'string'}
                }
              }
            ]
          },
          MessageResponse: {
            type: 'object',
            required: ['recipient'],
            properties: {
              recipient: {$ref: '#/components/schemas/ResolvedRecipient'}
            }
          }
        }
      },
      paths: {
        '/messages': {
          post: {
            operationId: 'createMessage',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['recipient'],
                    properties: {
                      recipient: {
                        allOf: [
                          {$ref: '#/components/schemas/SharedRecipientBase'},
                          {
                            type: 'object',
                            required: ['draftToken'],
                            properties: {
                              draftToken: {type: 'string'}
                            }
                          }
                        ]
                      }
                    }
                  }
                }
              }
            },
            responses: {
              200: {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {$ref: '#/components/schemas/MessageResponse'}
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
    const methods = resolvePaths(spec, types, emptyOptions, schemas);
    const usedSchemas = filterUsedSchemas(methods, schemas);
    const inplaceSchemas = generateInPlace(methods, types, emptyOptions, schemas);

    const requestBodySchema = inplaceSchemas.toArray.find(schema => schema.name === 'CreateMessageBody$post');
    const recipientProperty = requestBodySchema!.properties.toArray.find(property => property.name === 'recipient');
    const responseSchema = schemas.get('MessageResponse').get as SchemaObject;
    const responseRecipient = responseSchema.properties.toArray.find(property => property.name === 'recipient');

    expect(recipientProperty?.jsType).toBe('SharedRecipientBase & { draftToken: string }');
    expect(responseRecipient?.jsType).toBe('ResolvedRecipient');

    const createMessageMethod = methods.toArray.find(method => method.endpointName === 'createMessage');
    expect(createMessageMethod?.body.head.body.jsType).toBe('CreateMessageBody$post');
    expect(createMessageMethod?.response.responseType).toBe('MessageResponse');

    expect(usedSchemas.keySet.toArray.sort()).toEqual([
      'MessageResponse',
      'ResolvedRecipient',
      'SharedRecipientBase'
    ]);
  });

  it('tracks shared refs inside inline response allOf payloads', () => {
    const spec = {
      components: {
        schemas: {
          SharedEnvelope: {
            type: 'object',
            required: ['requestId'],
            properties: {
              requestId: {type: 'string'}
            }
          },
          AuditEntry: {
            type: 'object',
            required: ['code'],
            properties: {
              code: {type: 'string'}
            }
          }
        }
      },
      paths: {
        '/messages/audit': {
          get: {
            operationId: 'getMessageAudit',
            responses: {
              200: {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      allOf: [
                        {$ref: '#/components/schemas/SharedEnvelope'},
                        {
                          type: 'object',
                          required: ['audits'],
                          properties: {
                            audits: {
                              type: 'array',
                              items: {$ref: '#/components/schemas/AuditEntry'}
                            }
                          }
                        }
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
    const schemas = resolveSchemas(spec, types, emptyOptions);
    const methods = resolvePaths(spec, types, emptyOptions, schemas);
    const usedSchemas = filterUsedSchemas(methods, schemas);

    expect(methods.head.response.responseType).toBe('SharedEnvelope & { audits: ReadonlyArray<AuditEntry> }');
    expect(usedSchemas.keySet.toArray.sort()).toEqual(['AuditEntry', 'SharedEnvelope']);
  });

  it('preserves nullable anyOf shared objects in reused request and response fields', () => {
    const spec = {
      components: {
        schemas: {
          SharedActor: {
            type: 'object',
            required: ['id'],
            properties: {
              id: {type: 'string'}
            }
          },
          NotificationResponse: {
            type: 'object',
            required: ['actor'],
            properties: {
              actor: {
                anyOf: [
                  {$ref: '#/components/schemas/SharedActor'},
                  {type: 'null'}
                ]
              }
            }
          }
        }
      },
      paths: {
        '/notifications': {
          post: {
            operationId: 'createNotification',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['actor'],
                    properties: {
                      actor: {
                        anyOf: [
                          {$ref: '#/components/schemas/SharedActor'},
                          {type: 'null'}
                        ]
                      }
                    }
                  }
                }
              }
            },
            responses: {
              200: {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {$ref: '#/components/schemas/NotificationResponse'}
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
    const methods = resolvePaths(spec, types, emptyOptions, schemas);
    const usedSchemas = filterUsedSchemas(methods, schemas);
    const inplaceSchemas = generateInPlace(methods, types, emptyOptions, schemas);

    const requestBodySchema = inplaceSchemas.toArray.find(schema => schema.name === 'CreateNotificationBody$post');
    const requestActor = requestBodySchema!.properties.toArray.find(property => property.name === 'actor');
    const responseSchema = schemas.get('NotificationResponse').get as SchemaObject;
    const responseActor = responseSchema.properties.toArray.find(property => property.name === 'actor');

    expect(requestActor?.jsType).toBe('SharedActor | null');
    expect(responseActor?.jsType).toBe('SharedActor | null');
    expect(usedSchemas.keySet.toArray.sort()).toEqual(['NotificationResponse', 'SharedActor']);
  });
});
