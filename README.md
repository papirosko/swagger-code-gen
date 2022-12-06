# swagger-code-gen
The utility to generate a client for a services, described with openapi.

Install:
```shell
npm install -D @penkov/swagger-code-gen
```


Usage:
```shell
generate-client --url <URI> output_filename.ts
```

Cli parameters:
* `--url <URI>` - the swagger url
* `--referencedObjectsNullableByDefault` - then specified, the generated code will assume that
  any object's field, that references another object, can be null, unless it is explicitly specified to be not nullable
  (which is default in .net world: asp generates wrong spec)
* `--enableScats` - generate additional wrappers in [scats](https://www.npmjs.com/package/scats) 
  style for all objects and create a service with methods for each endpoint.
