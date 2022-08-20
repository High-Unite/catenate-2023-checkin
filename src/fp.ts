export function compose(...fns) {
  return function composedFn(x) {
    return fns.reduceRight(function composeReducer(v, f) {
      return f(v);
    }, x);
  };
}
export function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) {
      return fn.apply(this, args);
    } else {
      return function (...args2) {
        return curried.apply(this, args.concat(args2));
      };
    }
  };
}
export const map = curry((fn, arr) => arr.map(fn));
export const filter = curry((fn, arr) => arr.filter(fn));
export const reduce = curry((reducerFn, initialValue, arr) =>
  arr.reduce(reducerFn, initialValue)
);
export const invert = curry((fn, v) => !v);
export const promises = {
  then: curry((cb, promise) => promise.then(cb)),
};
export function identity(x) {
  return x
}
export function listCombine(list,val) {
    return [ ...list, val ];
}
export const transduceMap =
    curry( function mapReducer(mapperFn,combinerFn){
        return function reducer(list,v){
            return combinerFn( list, mapperFn( v ) );
        };
    } );

export const transduceFilter =
    curry( function filterReducer(predicateFn,combinerFn){
        return function reducer(list,v){
            if (predicateFn( v )) return combinerFn( list, v );
            return list;
        };
    } );
export const transduce = curry((transducer,combinerFn,initialValue,list) => {
    var reducer = transducer( combinerFn );
    return list.reduce( reducer, initialValue );
})
export function trace(fn) {
  return function traced(...args) {
    console.log(...args)
    return fn(...args)
  }
}