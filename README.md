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



# Example of generated code:

```shell
generate-client --enableScats --url https://petstore3.swagger.io/api/v3/openapi.json petstore.ts
```

Will generate:
```typescript
// header skipped

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
        requestOptions: RequestOptions = defaultRequestOptions()
): Promise<Pet> {
  let query = '';
  const request = new Request(`${requestOptions.apiPrefix}/pet${query}`, {
    method: 'put',
    body: JSON.stringify(body),
    headers: {
      ...option(requestOptions.headers).getOrElseValue({}),
    }
  });
  const preProcessed = option(requestOptions.preProcessRequest).map(cb => cb(request)).getOrElseValue(request);
  const resp = await fetch(preProcessed);
  if (resp.ok) {
    const postProcessed = option(requestOptions.postProcessResponse)
            .map(cb => cb(preProcessed, resp))
            .getOrElseValue(resp);
    const json = option(resp.headers.get('content-length'))
            .map(x => parseInt(x))
            .getOrElseValue(0) > 0 ? await postProcessed.json() : null;
    return json as Pet;
  } else {
    throw resp;
  }
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
        requestOptions: RequestOptions = defaultRequestOptions()
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
  const preProcessed = option(requestOptions.preProcessRequest).map(cb => cb(request)).getOrElseValue(request);
  const resp = await fetch(preProcessed);
  if (resp.ok) {
    const postProcessed = option(requestOptions.postProcessResponse)
            .map(cb => cb(preProcessed, resp))
            .getOrElseValue(resp);
    const json = option(resp.headers.get('content-length'))
            .map(x => parseInt(x))
            .getOrElseValue(0) > 0 ? await postProcessed.json() : null;
    return json as ReadonlyArray<Pet>;
  } else {
    throw resp;
  }
}


// ...



// scats wrappers

export class OrderDto {

  constructor(
          readonly id: number,
          readonly petId: number,
          readonly quantity: number,
          readonly shipDate: string,
          readonly status: string,
          readonly complete: boolean,
  ) {}


  static fromJson(json: Order): OrderDto {
    return new OrderDto(
            json.id,
            json.petId,
            json.quantity,
            json.shipDate,
            json.status,
            json.complete,
    );
  }

  copy(fields: Partial<OrderDto>): OrderDto {
    return new OrderDto(
            option(fields.id).getOrElseValue(this.id),
            option(fields.petId).getOrElseValue(this.petId),
            option(fields.quantity).getOrElseValue(this.quantity),
            option(fields.shipDate).getOrElseValue(this.shipDate),
            option(fields.status).getOrElseValue(this.status),
            option(fields.complete).getOrElseValue(this.complete),
    );
  }

  get toJson(): Order {
    return {
      id: this.id,
      petId: this.petId,
      quantity: this.quantity,
      shipDate: this.shipDate,
      status: this.status,
      complete: this.complete,
    };
  }
}


export class ApiClient {

  constructor(private readonly requestOptions: RequestOptions = defaultRequestOptions()) {
  }


  async updatePet(
          body: Pet,
          requestOptions: RequestOptions = this.requestOptions
  ): Promise<TryLike<PetDto>> {
    return (await Try.promise(() =>
            updatePet(
                    body,
                    requestOptions
            )
    ))
            .map(res => PetDto.fromJson(res))
            ;
  }

  async addPet(
          body: Pet,
          requestOptions: RequestOptions = this.requestOptions
  ): Promise<TryLike<PetDto>> {
    return (await Try.promise(() =>
            addPet(
                    body,
                    requestOptions
            )
    ))
            .map(res => PetDto.fromJson(res))
            ;
  }

//...
}

```
