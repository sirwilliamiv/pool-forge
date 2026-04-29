declare const __brand: unique symbol
type Brand<T, B> = T & { readonly [__brand]: B }

export type UserId = Brand<string, 'UserId'>
export type OrgId = Brand<string, 'OrgId'>
export type ProjectId = Brand<string, 'ProjectId'>
export type CustomerId = Brand<string, 'CustomerId'>
export type DrawingId = Brand<string, 'DrawingId'>
export type DrawingObjectId = Brand<string, 'DrawingObjectId'>
export type PriceBookId = Brand<string, 'PriceBookId'>
export type PriceBookItemId = Brand<string, 'PriceBookItemId'>
export type QuoteId = Brand<string, 'QuoteId'>
