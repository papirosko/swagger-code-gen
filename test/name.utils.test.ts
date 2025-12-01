import { describe, expect, it } from '@jest/globals';
import { NameUtils } from '../src/name.utils.js';

describe('NameUtils', () => {
  describe('normaliseClassname', () => {
    it('capitalizes class names and drops separators', () => {
      expect(NameUtils.normaliseClassname('pet-store.api')).toBe('PetStoreApi');
      expect(NameUtils.normaliseClassname('petStore')).toBe('PetStore');
    });

    it('skips repeated separators and uppercases the next letter', () => {
      expect(NameUtils.normaliseClassname('/order..item')).toBe('OrderItem');
      expect(NameUtils.normaliseClassname('')).toBe('');
    });
  });

  describe('normaliseMethodName', () => {
    it('escapes reserved delete and replaces dots/slashes with underscores', () => {
      expect(NameUtils.normaliseMethodName('delete')).toBe('$delete');
      expect(NameUtils.normaliseMethodName('pet.find/by/id')).toBe('pet_find_by_id');
    });
  });

  describe('normalisePropertyName', () => {
    it('replaces dots and dashes with underscores', () => {
      expect(NameUtils.normalisePropertyName('pet-name')).toBe('pet_name');
      expect(NameUtils.normalisePropertyName('meta.data.version')).toBe('meta_data_version');
    });
  });
});
