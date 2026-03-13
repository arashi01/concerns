/**
 * Nominal type branding for TypeScript.
 *
 * Uses a unique symbol key so branded values cannot be manually constructed
 * outside of companion `of`/`parse` functions. The brand exists only in the
 * type system — zero runtime cost.
 */

declare const brandSymbol: unique symbol;

/**
 * Wraps a base type `T` with a phantom brand `B`, creating a nominal type
 * that is structurally incompatible with other brands over the same base.
 *
 * @example
 * ```ts
 * type UserId = Brand<string, 'UserId'>;
 * type OrderId = Brand<string, 'OrderId'>;
 * // UserId and OrderId are both strings at runtime,
 * // but the compiler rejects cross-assignment.
 * ```
 */
type Brand<T, B extends string> = T & { readonly [brandSymbol]: B };

export type { Brand };
