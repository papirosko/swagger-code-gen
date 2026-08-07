export interface OpenApiProperty {
    type?: string | string[];
    format?: string;
    description?: string;
    nullable?: boolean;
    required?: boolean | string[];
    default?: string | number | boolean;
    minimum?: number;
    maximum?: number;
    $ref?: string;
    enum?: string[];
    items?: OpenApiProperty;
    oneOf?: Array<OpenApiProperty | OpenApiSchema>;
    allOf?: Array<OpenApiProperty | OpenApiSchema>;
    anyOf?: Array<OpenApiProperty | OpenApiSchema>;
    properties?: {
        [name: string]: OpenApiProperty;
    };
}


export interface OpenApiSchema {
    readonly $ref?: string;
    readonly allOf?: Array<OpenApiProperty | OpenApiSchema>;
    readonly oneOf?: Array<OpenApiProperty | OpenApiSchema>;
    readonly anyOf?: Array<OpenApiProperty | OpenApiSchema>;
    readonly name?: string;
    readonly title?: string;
    readonly description?: string;
    readonly type?: string | string[];
    readonly format?: string;
    readonly nullable?: boolean;
    enum?: string[];
    default?: string | number | boolean;
    required?: string[] | boolean;
    properties?: {
        [name: string]: OpenApiProperty;
    };
}

export interface OpenApiParam {
    name: string;
    in: string;
    type?: string | string[];
    description?: string;
    required?: boolean;
    deprecated?: boolean;
    schema?: OpenApiSchema;
}

export interface OpenApiRequestBody {
    description?: string;
    required?: boolean;
    $ref?: string;
    content?: {
        [mimeType: string]: {
            schema: OpenApiSchema;
        };
    };
}

export interface OpenApiResponse {
    description?: string;
    content?: {
        [mimeType: string]: {
            schema: OpenApiProperty;
        };
    };
}

export interface OpenApiMethod {
    tags?: string[];
    summary?: string;
    description?: string;
    operationId?: string;
    parameters?: OpenApiParam[];
    requestBody?: OpenApiRequestBody;
    responses: {
        [statusCode: string]: OpenApiResponse;
    };
}

export interface OpenApiPath {
    parameters?: OpenApiParam[];
    [method: string]: OpenApiMethod | OpenApiParam[] | undefined;
}

export interface OpenApiPaths {
    [path: string]: OpenApiPath;
}
