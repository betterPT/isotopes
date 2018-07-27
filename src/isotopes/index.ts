/*
 * Copyright (c) 2018 Martin Donath <martin.donath@squidfunk.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

import { omit } from "lodash"

import {
  IsotopeClient,
  IsotopeClientOptions
} from "isotopes/client"
import {
  decode,
  encode,
  IsotopeFormatOptions
} from "isotopes/format"
import {
  IsotopeSelect
} from "isotopes/select"

/* ----------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

/**
 * Isotope options
 *
 * @template T - Data type
 */
export interface IsotopeOptions<T extends {}> {
  format?: IsotopeFormatOptions        /* Format options */
  client?: IsotopeClientOptions        /* Client options */
  domain: string                       /* SimpleDB domain name */
  key: keyof T                         /* SimpleDB item name (primary key) */
}

/**
 * Isotope result
 *
 * @template T - Data type
 */
export interface IsotopeResult<T extends {}> {
  items: T[]                           /* Items on current page */
  next?: () => Promise<
    IsotopeResult<T>
  >                                    /* Next page */
}

/* ----------------------------------------------------------------------------
 * Class
 * ------------------------------------------------------------------------- */

/**
 * Isotope
 *
 * By default this library forces only valid entries to be written to SimpleDB
 * which means that all non-optional fields need to be defined in the payload.
 * However, SimpleDB allows reading and writing of partial attribute values,
 * so it might be desirable in some cases to loosen that restriction and allow
 * partial reads and writes. Isotope allows both configurations through simple
 * generic typing.
 *
 * The first type argument is mandatory and defines the base type. The second
 * and third type arguments can be used to specify what exact types put and get
 * operations return but normally they are equal to the base type.
 *
 * @example <caption>Allow complete values only</caption>
 *
 *   new Isotope<Type>
 *
 * @example <caption>Allow partial values in put and get operations</caption>
 *
 *   new Isotope<Type, Partial<Type>>
 *
 * @example <caption>Allow partial values in get operations only</caption>
 *
 *   new Isotope<Type, Type, Partial<Type>>
 *
 * @template T - Data type
 * @template TGet - Data type expected by put operation
 * @template TPut - Data type returned by get operation
 */
export class Isotope<
  T    extends {},
  TPut extends Partial<T> = T,
  TGet extends Partial<T> = TPut
> {

  /**
   * SimpleDB client
   */
  protected client: IsotopeClient

  /**
   * Create an isotope
   *
   * @param options - Options
   */
  public constructor(protected options: IsotopeOptions<T>) {
    this.client = new IsotopeClient(options.domain)
  }

  /**
   * Create an SQL query builder
   *
   * @return SQL query builder
   */
  public getQueryBuilder(): IsotopeSelect<T> {
    return new IsotopeSelect(this.options)
  }

  /**
   * Retrieve an item by identifier
   *
   * @param id - Identifier
   * @param names - Attribute names
   *
   * @return Promise resolving with (partial) item
   */
  public async get(
    id: string, names?: string[]
  ): Promise<TGet | undefined> {
    const item = await this.client.get(id, names)
    if (item) {
      const data = decode<TGet>(item.attrs, this.options.format)
      data[this.options.key] = item.id as any // TODO: Fix typings
      return data
    }
    return undefined
  }

  /**
   * Persist an item
   *
   * @param data - Data
   *
   * @return Promise resolving with no result
   */
  public async put(data: TPut): Promise<void> {
    await this.client.put(
      data[this.options.key].toString(),
      encode(
        omit(data, this.options.key),
        this.options.format
      )
    )
  }

  /**
   * Delete an item
   *
   * @param item - Item identifier
   * @param names - Attribute names
   *
   * @return Promise resolving with no result
   */
  public async delete(id: string, names?: string[]): Promise<void> {
    await this.client.delete(id, names)
  }

  /**
   * Retrieve a set of items matching the given SQL query
   *
   * @template TSelect - Data type returned by select operation
   *
   * @param expr - SQL query builder or expression
   * @param prev - Pagination token from previous result
   *
   * @return Promise resolving with result
   */
  public async select<TSelect extends Partial<T> = Partial<T>>(
    expr: IsotopeSelect<T> | string, prev?: string
  ): Promise<IsotopeResult<TSelect>> {
    const { items, next } = await this.client.select(expr.toString(), prev)
    return {
      items: items.map(item => {
        const data = decode<TSelect>(item.attrs, this.options.format)
        data[this.options.key] = item.id as any // TODO: Fix typings
        return data
      }),
      ...(next
        ? { next: () => this.select(expr.toString(), next) }
        : {})
    }
  }
}