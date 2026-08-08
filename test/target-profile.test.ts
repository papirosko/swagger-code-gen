import {describe, expect, it} from '@jest/globals';
import {none, some} from 'scats';
import {TargetProfileResolver} from '../src/target-profile.js';

describe('TargetProfileResolver', () => {
  it('defaults to browser globals with ArrayBuffer binary responses', () => {
    const target = TargetProfileResolver.resolve({
      target: none,
      multipartImplementation: none,
      binaryResponse: none
    });

    expect(target.profile).toBe('browser');
    expect(target.fetchImplementation).toBe('global');
    expect(target.multipartImplementation).toBe('global');
    expect(target.binaryResponse).toBe('arraybuffer');
    expect(target.importsNodeFetch).toBe(false);
    expect(target.importsFormData).toBe(false);
    expect(target.importsBuffer).toBe(false);
  });

  it('uses Node 18 globals by default', () => {
    const target = TargetProfileResolver.resolve({
      target: some('node18'),
      multipartImplementation: none,
      binaryResponse: none
    });

    expect(target.profile).toBe('node18');
    expect(target.fetchImplementation).toBe('global');
    expect(target.multipartImplementation).toBe('global');
    expect(target.binaryResponse).toBe('arraybuffer');
  });

  it('uses node-fetch3 with form-data and Buffer by default', () => {
    const target = TargetProfileResolver.resolve({
      target: some('node-fetch3'),
      multipartImplementation: none,
      binaryResponse: none
    });

    expect(target.profile).toBe('node-fetch3');
    expect(target.fetchImplementation).toBe('node-fetch3');
    expect(target.multipartImplementation).toBe('form-data');
    expect(target.binaryResponse).toBe('buffer');
    expect(target.importsNodeFetch).toBe(true);
    expect(target.importsFormData).toBe(true);
    expect(target.importsBuffer).toBe(true);
  });

  it('allows Node 18 multipart and binary overrides', () => {
    const target = TargetProfileResolver.resolve({
      target: some('node18'),
      multipartImplementation: some('form-data'),
      binaryResponse: some('buffer')
    });

    expect(target.multipartImplementation).toBe('form-data');
    expect(target.binaryResponse).toBe('buffer');
    expect(target.importsFormData).toBe(true);
    expect(target.importsBuffer).toBe(true);
  });

  it('rejects form-data multipart implementation for browser', () => {
    expect(() => TargetProfileResolver.resolve({
      target: some('browser'),
      multipartImplementation: some('form-data'),
      binaryResponse: none
    })).toThrow('--target browser supports only --multipart-impl global');
  });

  it('rejects Buffer binary responses for browser', () => {
    expect(() => TargetProfileResolver.resolve({
      target: some('browser'),
      multipartImplementation: none,
      binaryResponse: some('buffer')
    })).toThrow('--target browser supports only --binary-response arraybuffer');
  });

});
