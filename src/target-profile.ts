import {HashSet, none, Option, option, some} from 'scats';

export const targetProfiles = ['browser', 'node18', 'node-fetch3'] as const;
export const multipartImplementations = ['global', 'form-data'] as const;
export const binaryResponses = ['arraybuffer', 'buffer'] as const;

export type TargetProfile = typeof targetProfiles[number];
export type MultipartImplementation = typeof multipartImplementations[number];
export type BinaryResponse = typeof binaryResponses[number];
export type FetchImplementation = 'global' | 'node-fetch3';

export interface TargetProfileOptions {
    target: Option<string>;
    multipartImplementation: Option<string>;
    binaryResponse: Option<string>;
}

export interface TargetConfig {
    profile: TargetProfile;
    fetchImplementation: FetchImplementation;
    multipartImplementation: MultipartImplementation;
    binaryResponse: BinaryResponse;
    responseTypeName: 'Response' | 'FetchResponse';
    binaryTypeName: 'ArrayBuffer' | 'Buffer';
    importsNodeFetch: boolean;
    importsFormData: boolean;
    importsBuffer: boolean;
    usesGlobalFile: boolean;
    formBodyCast: string;
}

function supportedValues(values: readonly string[]): HashSet<string> {
    return HashSet.from([...values]);
}

export class TargetProfileResolver {
    private static readonly supportedTargets = supportedValues(targetProfiles);
    private static readonly supportedMultipartImplementations = supportedValues(multipartImplementations);
    private static readonly supportedBinaryResponses = supportedValues(binaryResponses);

    static resolve(options: TargetProfileOptions): TargetConfig {
        const profile = options.target.map(value => TargetProfileResolver.parseTarget(value)).getOrElseValue('browser');

        const multipartImplementation = options.multipartImplementation
            .map(value => TargetProfileResolver.parseMultipartImplementation(value))
            .getOrElseValue(TargetProfileResolver.defaultMultipartImplementation(profile));

        const binaryResponse = options.binaryResponse
            .map(value => TargetProfileResolver.parseBinaryResponse(value))
            .getOrElseValue(TargetProfileResolver.defaultBinaryResponse(profile));

        TargetProfileResolver.validateTargetConfig(profile, multipartImplementation, binaryResponse);

        const importsNodeFetch = profile === 'node-fetch3';
        const importsFormData = multipartImplementation === 'form-data';
        const importsBuffer = binaryResponse === 'buffer';

        return {
            profile: profile,
            fetchImplementation: importsNodeFetch ? 'node-fetch3' : 'global',
            multipartImplementation: multipartImplementation,
            binaryResponse: binaryResponse,
            responseTypeName: importsNodeFetch ? 'FetchResponse' : 'Response',
            binaryTypeName: binaryResponse === 'buffer' ? 'Buffer' : 'ArrayBuffer',
            importsNodeFetch: importsNodeFetch,
            importsFormData: importsFormData,
            importsBuffer: importsBuffer,
            usesGlobalFile: multipartImplementation === 'global',
            formBodyCast: multipartImplementation === 'form-data' ? ' as unknown as BodyInit' : ''
        };
    }

    static browser(): TargetConfig {
        return TargetProfileResolver.resolve({
            target: some('browser'),
            multipartImplementation: none,
            binaryResponse: none
        });
    }

    static optionsFromStrings(target: string | undefined,
                              multipartImplementation: string | undefined,
                              binaryResponse: string | undefined): TargetProfileOptions {
        return {
            target: option(target),
            multipartImplementation: option(multipartImplementation),
            binaryResponse: option(binaryResponse)
        };
    }

    private static unsupportedValueError(optionName: string, value: string, supported: HashSet<string>): Error {
        return new Error(`Unsupported ${optionName} "${value}". Supported values: ${supported.mkString(', ')}.`);
    }

    private static parseTarget(value: string): TargetProfile {
        if (!TargetProfileResolver.supportedTargets.contains(value)) {
            throw TargetProfileResolver.unsupportedValueError('--target', value, TargetProfileResolver.supportedTargets);
        }
        return value as TargetProfile;
    }

    private static parseMultipartImplementation(value: string): MultipartImplementation {
        if (!TargetProfileResolver.supportedMultipartImplementations.contains(value)) {
            throw TargetProfileResolver.unsupportedValueError(
                '--multipart-impl',
                value,
                TargetProfileResolver.supportedMultipartImplementations
            );
        }
        return value as MultipartImplementation;
    }

    private static parseBinaryResponse(value: string): BinaryResponse {
        if (!TargetProfileResolver.supportedBinaryResponses.contains(value)) {
            throw TargetProfileResolver.unsupportedValueError(
                '--binary-response',
                value,
                TargetProfileResolver.supportedBinaryResponses
            );
        }
        return value as BinaryResponse;
    }

    private static defaultMultipartImplementation(target: TargetProfile): MultipartImplementation {
        switch (target) {
            case 'browser':
            case 'node18':
                return 'global';
            case 'node-fetch3':
                return 'form-data';
        }
    }

    private static defaultBinaryResponse(target: TargetProfile): BinaryResponse {
        switch (target) {
            case 'browser':
            case 'node18':
                return 'arraybuffer';
            case 'node-fetch3':
                return 'buffer';
        }
    }

    private static validateTargetConfig(profile: TargetProfile,
                                        multipartImplementation: MultipartImplementation,
                                        binaryResponse: BinaryResponse) {
        if (profile === 'browser' && multipartImplementation !== 'global') {
            throw new Error('Unsupported target options: --target browser supports only --multipart-impl global.');
        }
        if (profile === 'browser' && binaryResponse !== 'arraybuffer') {
            throw new Error('Unsupported target options: --target browser supports only --binary-response arraybuffer.');
        }
    }
}
