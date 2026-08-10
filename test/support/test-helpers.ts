import {HashSet} from 'scats';
import {GenerationOptions} from '../../src/schemas.js';

export const emptyOptions: GenerationOptions = {
  referencedObjectsNullableByDefault: false,
  includeTags: HashSet.from<string>([]),
  excludeTags: HashSet.from<string>([]),
  onlyUsedSchemas: false,
  includeSchemasByMask: HashSet.from<string>([]),
  preserveUnknownFields: false
};

