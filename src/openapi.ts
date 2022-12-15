export interface OpenApiProperty {
    type: string;
    format?: string;
    description?: string;
    nullable?: boolean;
    required?: boolean;
    default?: string | number | boolean;
    minimum?: number;
    maximum?: number;
    $ref?: string;
    enum?: string[];
    items?: OpenApiProperty;
    oneOf?: OpenApiProperty[];
}


export interface OpenApiSchema {
    readonly name: string;
    readonly title: string;
    readonly type: string;
    enum?: string[];
    properties: {
        [name: string]: OpenApiProperty;
    };
}

export interface OpenApiParam {
    name: string;
    in: string;
    description?: string;
    required?: boolean;
    deprecated?: boolean;
    schema: OpenApiSchema;
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
    parameters?: OpenApiParam[];
    requestBody?: {
        description?: string;
        content?: {
            [mimeType: string]: {
                schema: OpenApiSchema;
            };
        };
    };
    responses: {
        [statusCode: number]: OpenApiResponse;
    };
}

export interface OpenApiPath {
    [method: string]: OpenApiMethod;
}

export interface OpenApiPaths {
    [path: string]: OpenApiPath;
}
