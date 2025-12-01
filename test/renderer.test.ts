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
  excludeTags: HashSet.from<string>([])
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
});
