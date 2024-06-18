# swagger-code-gen
The utility to generate a client for a services, described with openapi.

Install:
```shell
npm install -D @penkov/swagger-code-gen
```


Usage:
```shell
generate-client --url <URI> output_filename.ts
generate-client --url <URI> --includeTags tag1 tag2 -- output_filename.ts
```

Cli parameters:
* `--url <URI>` - the swagger url
* `--includeTags <tags...>` - Space-separated list of tags of paths to be included. Path is included if it contains any of specified tag
  Path is included if exclusion list is empty or path contains any of the tags from inclusion list.
  If the tag is both in inclusion and exclusion lists, it gets excluded.
* `--excludeTags <tags...>` - Space-separated list of tags of paths to be excluded. 
  Path is excluded if exclusion list is non-empty and path contains any of the tags from exclusion list.
  If the tag is both in inclusion and exclusion lists, it gets excluded.
* `--referencedObjectsNullableByDefault` - then specified, the generated code will assume that
  any object's field, that references another object, can be null, unless it is explicitly specified to be not nullable
  (which is default in .net world: asp generates wrong spec)
* `--enableScats` - generate additional wrappers in [scats](https://www.npmjs.com/package/scats) 
  style for all objects and create a service with methods for each endpoint.
* `--targetNode` - adds imports for `node-fetch` package in generated code.



# Example of generated code:

```shell
generate-client --enableScats --url https://petstore3.swagger.io/api/v3/openapi.json petstore.ts
```

Will generate:
```typescript
// header skipped

async function requestImpl<T>(request: Request, requestOptions: RequestOptions): Promise<T> {
  const preProcessed = requestOptions.preProcessRequest ? await requestOptions.preProcessRequest(request) : request;
  const resp = await fetch(preProcessed);
  const postProcessed = requestOptions.postProcessResponse ? await requestOptions.postProcessResponse(preProcessed, resp) : resp;
  if (postProcessed.ok) {
    let json: any = null;
    if (postProcessed.headers.has('content-length')) {
      const ct = parseInt(postProcessed.headers.get('content-length'));
      if (ct > 0) {
        json = await postProcessed.json()
      }
    }
    return json as T;
  } else {
    throw postProcessed;
  }
}




export interface Customer {
  readonly id: number;
  readonly username: string;
  readonly address: ReadonlyArray<Address>;
}


export interface Address {
  readonly street: string;
  readonly city: string;
  readonly state: string;
  readonly zip: string;
}


export interface Category {
  readonly id: number;
  readonly name: string;
}


export interface User {
  readonly id: number;
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly password: string;
  readonly phone: string;
  readonly userStatus: number;
}


export interface Tag {
  readonly id: number;
  readonly name: string;
}


export interface Pet {
  readonly id: number;
  readonly name: string;
  readonly category: Category;
  readonly photoUrls: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<Tag>;
  readonly status: string;
}


export interface ApiResponse {
  readonly code: number;
  readonly type: string;
  readonly message: string;
}



/**
 * PUT /pet
 * @summary Update an existing pet
 * @description Update an existing pet by Id
 * @param {Pet} body Update an existent pet in the store
 * @param {RequestOptions} requestOptions Additional request params
 * @return {Pet} Successful operation
 */
export async function updatePet(
        body: Pet,
        requestOptions: RequestOptions = defReqOpts()
): Promise<Pet> {
  let query = '';
  const request = new Request(`${requestOptions.apiPrefix}/pet${query}`, {
    method: 'put',
    body: JSON.stringify(body),
    headers: {
      ...option(requestOptions.headers).getOrElseValue({}),
    }
  });
  return requestImpl<Pet>(request, requestOptions);
}


// ...


/**
 * GET /pet/findByStatus
 * @summary Finds Pets by status
 * @description Multiple status values can be provided with comma separated strings
 * @param {&#39;available&#39; | &#39;pending&#39; | &#39;sold&#39;} status Status values that need to be considered for filter
 * @param {RequestOptions} requestOptions Additional request params
 * @return {ReadonlyArray&lt;Pet&gt;} successful operation
 */
export async function findPetsByStatus(
        status: 'available' | 'pending' | 'sold' = 'available',
        requestOptions: RequestOptions = defReqOpts()
): Promise<ReadonlyArray<Pet>> {
  let query = '';
  const queryParams = [];
  queryParams.push(`status=${status}`);
  if (queryParams.length > 0) {
    query = '?' + queryParams.join('&');
  }
  const request = new Request(`${requestOptions.apiPrefix}/pet/findByStatus${query}`, {
    method: 'get',
    body: undefined,
    headers: {
      ...option(requestOptions.headers).getOrElseValue({}),
    }
  });
  return requestImpl<Pet>(request, requestOptions);
}


// ...



// scats wrappers


export class PetDto {

  constructor(
          readonly id: number,
          readonly name: string,
          readonly category: CategoryDto,
          readonly photoUrls: Collection<string>,
          readonly tags: Collection<TagDto>,
          readonly status: string,
  ) {}


  static fromJson(json: Pet): PetDto {
    return new PetDto(
            json.id,
            json.name,
            CategoryDto.fromJson(json.category),
            Collection.from(option(json.photoUrls).getOrElseValue([]))
            ,
            Collection.from(option(json.tags).getOrElseValue([]))
                    .map(i => TagDto.fromJson(i)),
            json.status,
    );
  }

  copy(fields: Partial<PetDto>): PetDto {
    return new PetDto(
            option(fields.id).getOrElseValue(this.id),
            option(fields.name).getOrElseValue(this.name),
            option(fields.category).getOrElseValue(this.category),
            option(fields.photoUrls).getOrElseValue(this.photoUrls),
            option(fields.tags).getOrElseValue(this.tags),
            option(fields.status).getOrElseValue(this.status),
    );
  }

  get toJson(): Pet {
    return {
      id: this.id,
      name: this.name,
      category: this.category.toJson,
      photoUrls: this.photoUrls
              .toArray,
      tags: this.tags
              .map(_ => _.toJson)                .toArray,
      status: this.status,
    };
  }
}


export class ApiClient {

  constructor(private readonly requestOptions: RequestOptions = defReqOpts()) {
  }

  // ... some methods skipped

  async updatePet(
          body: PetDto,
          requestOptions: RequestOptions = this.requestOptions
  ): Promise<TryLike<PetDto>> {
    return (await Try.promise(() =>
            updatePet(
                    body.toJson,
                    requestOptions
            )
    ))
            .map(res => PetDto.fromJson(res))
            ;
  }

  async findPetsByStatus(
          status: 'available' | 'pending' | 'sold',
          requestOptions: RequestOptions = this.requestOptions
  ): Promise<TryLike<Collection<PetDto>>> {
    return (await Try.promise(() =>
            findPetsByStatus(
                    status,
                    requestOptions
            )
    ))
            .map(res => Collection.from(option(res).getOrElseValue([])))
            .map(items => items.map(i => PetDto.fromJson(i)))
            ;
  }

//...
}

```
